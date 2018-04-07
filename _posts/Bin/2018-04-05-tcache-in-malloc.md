---
title: Malloc中的TCache机制
date: 2018-04-05
tag: Bin
layout: post
---

## 0x00 前言

tcache机制在Glibc 2.26中被首次引入。全名是thread-local-caching，如同字面意思，它会为每一个线程分配一个"快速cache"，从而实现了无锁的分配算法，从而提高程序执行效率。根据作者描述，有不错的性能提升。

tcache机制在Glibc中是条件编译的，回顾commit，默认应该是开启的。在当前(2018-04-05)经过简单的版本对比，Ubuntu，和Fedora的最新版，以及Arch Linux(滚动更新)已经支持到glibc-2.26。经过本机测试，Arch Linux开启了tcache机制。

这项新机制的引入，会对经典的堆漏洞产生不小的影响。但是从整体来看，更倾向与让堆漏洞利用更加容易。

本次分析基于glibc-2.26，仓库源码更新日期为2017-08-02。关于glibc-2.27可以使用diff进行对比。

## 0x01 TCache结构

tcache引入了两个新的结构体，二者都十分简单：

``` c
typedef struct tcache_entry{
    struct tcache_entry *next;
} tcache_entry;

typedef struct tcache_perthread_struct
{
    char counts[TCACHE_MAX_BINS];
    tchche_entry *entries[TCACHE_MAX_BINS];
} tcache_perthread_struct;
```

`TCACHE_MAX_BINS`的大小默认是64，整个`perthe_perthread_struct`构成了一组单链表，就和fastbin一样。最小的chunk size为0x18(实际是0x20，chunk size的最小值)，最大为0x408(对齐后为0x410)，按照16字节的速度递增。

从某种意义上来说，tcache仅仅是简单的复现了fastbin的机制而已。但是与fastbin不同，整个tcache是完全优先与旧机制的。

tcache会在下面的情况中被填充：

* free：在`_int_free`执行`check_inuse_chunk`之后，tcache便会对chunk进行检查。如果chunk size符合要求，并且对应的cache未满，则会跳过后面的代码，将其填入tcache。
* malloc：以下3中情况会触发tcache填充：
    * 在fastbin中，如果成功找到了一个对应的chunk，那么对应fastbin中的其他(等待分配的)chunk会被填充到tcache中，直到上限。
    * smallbin中的情况与fastbin相似，双链表中的剩余chunk会被填充到tcache中，直到上限。
    * binning code(chunk合并等其他情况)中，每一个符合要求的chunk都会优先被填入tcache。在寻找结束后，tcache返回符合要求的一个，这会在large request之前执行。

每一组tcahe的上限默认是7。也就是说在默认情况下，最多会有64×7个chunk被填充到tcache中。

tcache会在下面的情况中被使用：

* 在`__libc_malloc`执行`_int_malloc`前，tcache会对size执行检查，如果cache中有符合条件的chunk，则会直接返回此chunk。
* 在binning code中，即上面所说，执行large request之前会返还cache中符合要求的一个(最后一个)
* 除了上面一条，binning coding中还会根据设定的条件上限执行一次返还。但是默认情况下该选项是关闭的(上限为0)，不会执行。

一些细节：

* 在fastbin的填充中，chunk的顺序是相反的
* tcache不会执行chunk合并，无论是相邻chunk，还是chunk和top chunk
* 被填充到tcache中的chunk以"使用中"的状态保存，它们的`inuse`标志位不会被清空


## 0x02 弱检查特性

tcache的链表操作由`tcache_put`和`tcache_get`完成。

``` c
/* Caller must ensure that we know tc_idx is valid and there's room
   for more chunks.  */
static void
tcache_put (mchunkptr chunk, size_t tc_idx)
{
  tcache_entry *e = (tcache_entry *) chunk2mem (chunk);
  assert (tc_idx < TCACHE_MAX_BINS);
  e->next = tcache->entries[tc_idx];
  tcache->entries[tc_idx] = e;
  ++(tcache->counts[tc_idx]);
}

/* Caller must ensure that we know tc_idx is valid and there's
   available chunks to remove.  */
static void *
tcache_get (size_t tc_idx)
{
  tcache_entry *e = tcache->entries[tc_idx];
  assert (tc_idx < TCACHE_MAX_BINS);
  assert (tcache->entries[tc_idx] > 0);
  tcache->entries[tc_idx] = e->next;
  --(tcache->counts[tc_idx]);
  return (void *) e;
}
```

非常经典的单链表操作。函数内部没有进行任何完整性检查，而是将其交给了外围操作完成。

虽然正确使用malloc是不会导致tcache发生crash的，但是仔细分析可以发现，tcache机制会让各类堆漏洞攻击变得更容易。

* tcache更宽松的检查让畸形数据更易构造
* tcache结构本身非常脆弱，是"优良"的攻击目标

## 0x03 The House of Spirit

让我们观察一下`_int_free`中的tcache操作：

```
size_t tc_idx = csize2tidx (size);

if (tcache &&
    tc_idx < mp_.tcache_bins &&
    tcache->counts[tc_idx] < mp_.tcache_count)
{
    tcache_put (p, tc_idx);
    return;
}
```

`mp_.tcache_bins`是常量值，与`TCACHE_MAX_BINS`相等；`mp_.tcache_count`的值为7。

在这段代码之前，唯一执行的检查只有`check_inuse_chunk`。代码本身只会验证idx是否符合要求，cache是否达到上限。相比与旧的free机制，释放一块伪造的chunk会更加容易。

* chunk的指针地址满足`2 * SIZE_SZ`对齐
* chunk size的大小低于tcache的上限(0x410)

面对如此宽松的检查，我们无需构造合法的`next_size`即可完成house of spirit。并且由于tcache的缓存范围很大，除了以往的fastbin之外，smallbin也可以成功构造house of spirit了。

## 0x04 chunk回环

继续分析`_int_free`中的代码，我们可以发现，tcache对Double-Free没有任何抵抗性。如果我们能在一块chunk上连续执行两次free，tcache中就会出现"单链表回环"。

来看一下`__libc_malloc`中的情况：

``` c
/* int_free also calls request2size, be careful to not pad twice.  */
 size_t tbytes = request2size (bytes);
 size_t tc_idx = csize2tidx (tbytes);

MAYBE_INIT_TCACHE ();

DIAG_PUSH_NEEDS_COMMENT;
if (tc_idx < mp_.tcache_bins
    /*&& tc_idx < TCACHE_MAX_BINS*/ /* to appease gcc */
    && tcache
    && tcache->entries[tc_idx] != NULL)
{
    return tcache_get (tc_idx);
}
DIAG_POP_NEEDS_COMMENT;
```

和`_int_free`中的情况差不多，这段代码在malloc hook之后就会执行，并且不会做任何完整性检查。在成功构造出tcache回环之后，我们即可使用malloc获得任意个指向相同chunk的指针。

唯一需要注意的是tcache的计数器，它可以小于0，但是上限却只有7。

## 0x05 chunk重叠

现在分析一下`_int_malloc`中的tcache填充。我们以fastbin的情况为例：

``` c
/* While we're here, if we see other chunks of the same size,
 stash them in the tcache.  */
size_t tc_idx = csize2tidx (nb);
if (tcache && tc_idx < mp_.tcache_bins)
{
    mchunkptr tc_victim;

    /* While bin not empty and tcache not full, copy chunks over.  */
    while(tcache->counts[tc_idx] < mp_.tcache_count
        && (pp = *fb) != NULL)
    {
        REMOVE_FB (fb, tc_victim, pp);
        if (tc_victim != 0)
        {
            tcache_put (tc_victim, tc_idx);
        }
    }
}
```

剩下的两种情况和fastbin中的代码相似，在检查是否满足cache条件后，tcache便会无条件的将剩余chunk填充入cache中。

可以发现，在这个过程中tcache不会对chunk size进行检查。我们可以轻易的改写chunk size，并在下一次malloc中获得一个"与事实不符的chunk"，从而达成堆溢出，或者其他事情。

## 0x06 SmallBin的双链表

在填充smallbin的chunk时，我们关注一下双链表的unlink：

``` c
/* While we're here, if we see other chunks of the same size,
 stash them in the tcache.  */
size_t tc_idx = csize2tidx (nb);
if (tcache && tc_idx < mp_.tcache_bins)
{
    mchunkptr tc_victim;

    /* While bin not empty and tcache not full, copy chunks over.  */
    while (tcache->counts[tc_idx] < mp_.tcache_count
        && (tc_victim = last (bin)) != bin)
    {
        if (tc_victim != 0)
        {
            bck = tc_victim->bk;
            set_inuse_bit_at_offset (tc_victim, nb);
            if (av != &main_arena)
                set_non_main_arena (tc_victim);
            bin->bk = bck;
            bck->fd = bin;
            tcache_put (tc_victim, tc_idx);
        }
    }
}
```

与旧流程中获取smallbin时使用的unlink做对比，我们可以看到，有一项检查被忽略了：

``` c
if (__glibc_unlikely (bck->fd != victim))
{
    errstr = "malloc(): smallbin double linked list corrupted";
    goto errout;
}
```

我们可以更容易的完成House of Lore，或者在smallbin中完成与unsorted bck write相似的攻击。

## 0x07 脆弱的TCache结构

现在让我们的焦点转移到tcache的初始化：

``` c
static void
tcache_init(void)
{
    mstate ar_ptr;
    void *victim = 0;
    const size_t bytes = sizeof (tcache_perthread_struct);

    if (tcache_shutting_down)
        return;

    arena_get (ar_ptr, bytes);
    victim = _int_malloc (ar_ptr, bytes);
    if (!victim && ar_ptr != NULL)
    {
        ar_ptr = arena_get_retry (ar_ptr, bytes);
        victim = _int_malloc (ar_ptr, bytes);
    }

    if (ar_ptr != NULL)
        __libc_lock_unlock (ar_ptr->mutex);

    /* In a low memory situation, we may not be able to allocate memory
     - in which case, we just keep trying later.  However, we
     typically do this very early, so either there is sufficient
     memory, or there isn't enough memory to do non-trivial
     allocations anyway.  */
    if (victim)
    {
        tcache = (tcache_perthread_struct *) victim;
        memset (tcache, 0, sizeof (tcache_perthread_struct));
    }
}
```

`tcache_ini`在宏`MAYBE_INIT_TCACHE()`中被调用。观察init的流程，可以发现tcache结构体是直接存储在堆中的。在x64下计算`tcache_perthread_struct`，大小为0x240，一个smallbin的chunk。

在第一次调用malloc时，`MAYBE_INIT_TCACHE()`就会被执行，因此对于单线程来说，这个chunk一定会在top chunk上，我们能简单的计算出它的位置。

在多线程情况中，依赖与arena的复杂性，tcache结构的位置会变得复杂。

回顾上面的一系列代码，我们可以得知，tcache不仅不会检查chunk的完整性，`tcache_perthread_struct`自身的完整性也不会被检查。如果我们可以溢出到tcache结构，覆写entries部分，我们就能控制tcache将chunk设置在任意内存区域中，就像利用arena的思路一样。

## 0x08 其他问题

被填入tcache中的chunk不会被清除inuse标志位，也不会被合并。

如果我们先填满tcache，然后经过悬指针进行二次free，即可构造出"原地的Double-Free"

对于堆溢出的情况，没有inuse标志位的困扰也使得利用思路更为简单。

我们甚至可以充分利用mallo中的tcache回填机制，让fastbin/smallbin中的chunk重获inuse状态 -- 只需要触发一次合适的malloc

## 0x09 绕过TCache

有一点是必须被注意的，任何小于0x410的chunk在free时都会被无条件填入tcache，直到cache已满。这也就是说，如果我们需要进行Unlink攻击，或者构造Double-Free，必须先绕过tcache。

这是简单的，tcache中的bins上限是7，简单的7次free即可填满tcache。

除了free，我们也需要注意malloc中的tcache回填，这可能会对我们的EXP产生影响。不过与tcache带来的便利相比，调整EXP是非常值得的，并且不会很难。

## 0xA0 总结

tcache的弱检查特性使得下面的情况更容易发生：

* 将畸形的chunk插入bins缓存
    * 合法的free堆以外的内存
    * 篡改chunk size造成重叠
* 链表环回
    * Double-Free引发的环回
    * UAF导致的人工环回
* Unlink攻击
    * smallbin中缺少的检查
* TCache结构体
    * 任意内存区域的malloc
* 标志位问题
    * N-Free攻击更高效了
    * 触发malloc会使得相应bins中其他chunk获得inuse(发生回填)

tcache的模型和bins相似，所以我们的思路和攻击bins是差不多的。

可以看到，几乎所有的攻击方式都变得更容易一些了。究其原因，只是因为**检查做的太少了**。

不过这些都是可以被修复的，与完整性检查造成的时间消耗相比，无锁算法带来的性能提升是非常有价值的。

> 算法自身安全不代表整体一定安全

## 相关链接

1. [thread local caching in glibc malloc](http://tukan.farm/2017/07/08/tcache/)
2. [MallocInternals](https://sourceware.org/glibc/wiki/MallocInternals)

