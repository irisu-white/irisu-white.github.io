---
title: Glibc中Canary的实现机制 - Runtime部分
data: 2018-04-15
tag: Bin
layout: post
---

## 0x00 简介

Canary，也被称为stack guard，stack cookie，是Linux Glibc中非常古老的漏洞缓解机制。

Canary有多种存在：

* 应用程序栈：由gcc，ld，glibc配合完成
* 内核进程上下文栈：由内核代码完成
* 内核中断上下文栈：由内核代码完成

本次讨论的主题是应用程序栈的Canary。

本次讨论的主题：

* Canary如何生成
* 存储Canary的结构
* FS寄存器与User Program

本次分析的部分是Glibc中的代码，在后续的另一篇中，会从Kernel代码中解析余下的细节，比如GTD和Thread Stack。

架构环境：Linux x86_64

源代码版本：Linux-4.15.2 & Glibc-2.26

## 0x01 Canary预览

我们都知道，Canary在Gcc的编译参数中是默认开启的(部分Canary)。

用户程序中对于Canary的处理也非常简单。如果我们有这样一段代码：

``` c
/* foo.c */

int main(void){
    char haha[256];

    return 0;
}
```

生成的汇编就会是这样的：

```
<+00>: push   rbp
<+01>: mov    rbp,rsp
<+04>: sub    rsp,0x110
<+11>: mov    rax,QWORD PTR fs:0x28
<+20>: mov    QWORD PTR [rbp-0x8],rax
<+24>: xor    eax,eax
<+26>: mov    eax,0x0
<+31>: mov    rdx,QWORD PTR [rbp-0x8]
<+35>: xor    rdx,QWORD PTR fs:0x28
<+44>: je     0x69d <main+51>
<+46>: call   0x550 <__stack_chk_fail@plt>
<+51>: leave
<+52>: ret
```

简单明了的方案：在<main+11>处，通过读取`fs:0x28`获得Canary，然后写入栈中。在ret之前，再次读取，与栈中值比较，不相等就会跳出到`__stack_chk_fail`中。

至于`__stack_chk_fail`中发生了什么，我的博客中的另一篇文章[Smashing In Canary](http://rabbithouse.me/2017/02/09/smashing-in-canary.html)已经给出了详细的分析。

`fs:0x28`的简单解释是：fs是指针，读取fs中offset为0x28的变量值。

让我们先忽略这个fs是如何生成的，先来解析最简单的开始：Canary的生成。

## 0x02 生成Canary

Canary有多种形式，比如全零截断，空白符(`\n\t`)截断，随机数。glibc中使用的是随机数。因为是随机数，所以自然是由随机数发生器生成的。

这个过程在`__libc_start_main`中完成：

``` c
// File: csu/libc-start.c

  /* Set up the stack checker's canary.  */
  uintptr_t stack_chk_guard = _dl_setup_stack_chk_guard (_dl_random);
# ifdef THREAD_SET_STACK_GUARD
  THREAD_SET_STACK_GUARD (stack_chk_guard);
# else
  __stack_chk_guard = stack_chk_guard;
# endif
```

`_dl_random`是内核提供的随机数生产器：

``` c
// File: elf/dl-support.c

/* Random data provided by the kernel.  */
void *_dl_random;
```

`_dl_setup_stack_chk_guard`的逻辑很简单，它会读取`_dl_random`，构建长度合适的Canary：

``` c
// File: sysdeps/generic/dl-osinfo.h

static inline uintptr_t __attribute__ ((always_inline))
_dl_setup_stack_chk_guard (void *dl_random)
{
  union
  {
    uintptr_t num;
    unsigned char bytes[sizeof (uintptr_t)];
  } ret = { 0 };

  if (dl_random == NULL)
    {
      ret.bytes[sizeof (ret) - 1] = 255;
      ret.bytes[sizeof (ret) - 2] = '\n';
    }
  else
    {
      memcpy (ret.bytes, dl_random, sizeof (ret));
#if BYTE_ORDER == LITTLE_ENDIAN
      ret.num &= ~(uintptr_t) 0xff;
#elif BYTE_ORDER == BIG_ENDIAN
      ret.num &= ~((uintptr_t) 0xff << (8 * (sizeof (ret) - 1)));
#else
# error "BYTE_ORDER unknown"
#endif
    }
  return ret.num;
}
```

有个很有趣的事情是，如果传入的随机数指针为空，Canary会成为一个简单的固定值。但是，在x86_86中，这怎么可能呢？

回到`__libc_start_main`中，在获取了Canary后，下一步就是将其写入一个稳定的地点。

对于x86_64来说，上面的宏会执行`THREAD_SET_STACK_GUARD`。

额外的，如果不使用`THREAD_SET_STACK_GUARD`的话，就会将Canary简单的保存在`__stack_chk_guard`中，这是Glibc中的一个全局变量，有FULL-RELRO属性。

让我们来讨论正常的情况，即`THREADSSET_STACK_GUARD`做了什么。

## 0x03 tcbhead_t与Canary

这一部分与TLS相关，所以大部分的代码都在`sysdeps/x86_64/tls.h`中

先来看看`THREAD_SET_STACK_GUARD`的具体实现。这肯定是一段宏(因为是全大写)：

``` c
// File: sysdeps/x86_64/nptl/tls.h

# define THREAD_SET_STACK_GUARD(value) \
    THREAD_SETMEM (THREAD_SELF, header.stack_guard, value)

# define THREAD_SETMEM(descr, member, value)                      \
  ({ if (sizeof (descr->member) == 1)                             \
       asm volatile ("movb %b0,%%fs:%P1" :                        \
             : "iq" (value),                                      \
               "i" (offsetof (struct pthread, member)));          \
     else if (sizeof (descr->member) == 4)                        \
       asm volatile ("movl %0,%%fs:%P1" :                         \
             : IMM_MODE (value),                                  \
               "i" (offsetof (struct pthread, member)));          \
     else                                                         \
       {                                                          \
     if (sizeof (descr->member) != 8)                             \
       /* There should not be any value with a size other than 1, \
          4 or 8.  */                                             \
       abort ();                                                  \
                                                                  \
     asm volatile ("movq %q0,%%fs:%P1" :                          \
               : IMM_MODE ((uint64_t) cast_to_integer (value)),   \
             "i" (offsetof (struct pthread, member)));            \
       }})    
```

Glibc特有的宏编程，虽然是个函数，但是直接宏内联了。

从这段代码我们几乎得不到什么，大部分的汇编都是在通过fs寄存器读写内存。那么`THREAD_SELF`是什么呢？

``` c

/* Return the thread descriptor for the current thread.

   The contained asm must *not* be marked volatile since otherwise
   assignments like
    pthread_descr self = thread_self();
   do not get optimized away.  */

# define THREAD_SELF                                    \
  ({ struct pthread *__self;                            \
     asm ("mov %%fs:%c1,%0" : "=r" (__self)             \
      : "i" (offsetof (struct pthread, header.self)));  \
     __self;})

```

看到了`offsetof`，差不多就定位到了关键的结构体：

``` c
// File: nptl/descr.h

struct pthread
{
  union
  {
#if !TLS_DTV_AT_TP
    /* This overlaps the TCB as used for TLS without threads (see tls.h).  */
    tcbhead_t header;
#else
    struct
    {
      int multiple_threads;
      int gscope_flag;
# ifndef __ASSUME_PRIVATE_FUTEX
      int private_futex;
# endif
    } header;
#endif
    void *__padding[24];
  };
  
  ...
}
```

这个结构体我们非常熟悉，毕竟有一个库就是pthread。这个结构体是Glibc中实现的POSIX版本的线程模型(不是内核的)。

根据`offsetof`的其他参数，我们忽视pthread中的其他部分(这个结构非常大，有300多行源代码)，关注一下`tcbhead_t`类型：

``` c
// File: sysdeps/x86_64/nptl/tls.h

typedef struct
{
  void *tcb;        /* Pointer to the TCB.  Not necessarily the
                       thread descriptor used by libpthread.  */
  dtv_t *dtv;
  void *self;       /* Pointer to the thread descriptor.  */
  int multiple_threads;
  int gscope_flag;
  uintptr_t sysinfo;
  uintptr_t stack_guard;
  uintptr_t pointer_guard;
  unsigned long int vgetcpu_cache[2];
# ifndef __ASSUME_PRIVATE_FUTEX
  int private_futex;
# else
  int __glibc_reserved1;
# endif
  int __glibc_unused1;
  /* Reservation of some values for the TM ABI.  */
  void *__private_tm[4];
  /* GCC split stack support.  */
  void *__private_ss;
  long int __glibc_reserved2;
  /* Must be kept even if it is no longer used by glibc since programs,
     like AddressSanitizer, depend on the size of tcbhead_t.  */
  __128bits __glibc_unused2[8][4] __attribute__ ((aligned (32)));

  void *__padding[8];
} tcbhead_t;
```

这一次非常明显了，我们看到了`uintptr_t stack_guard`变量。无论是猜测还是事实，Canary最终被写入的位置的确就是这里。

`uintptr_t`在x86_64中的长度为8，`int`的长度为4，指针变量长度为8。计算一下`stack_guard`在这个结构体中的offset：`8*3+4*2+8=0x28`。

我们得到了0x28，和`fs:0x28`中的数值一样。实际上，FS寄存器指向的就是这个结构体。

在`__libc_start_main`中准备写入Canary之前，TLS(也就是上面的结构体)的内存空间分配就已经完成了，并且在分配的最后，会将FS寄存器与TLS结构关联。到了执行`THREAD_SET_STACK_GUARD`时，只需要使用FS即可完成Canary的持久化写入。

## 0x04 FS寄存器

现在讨论FS寄存器。对于每一个不同的进程来说，Canary都是不同的，因为TLS(Thread Local Struct)不同。既然如此，FS必定不是常量。那么这个FS在什么时候被设定呢？

再次运行0x01中的foo程序，使用strace追踪一下系统调用：

``` bash
$ strace ./foo
execve("./foo", ["./foo"], 0x7fffdaeb5180 /* 59 vars */) = 0

...

arch_prctl(ARCH_SET_FS, 0x7f6c866c94c0) = 0

...

+++ exited with 0 +++
```

`ARCH_SET_FS`这个名称非常显眼，简单查看一下`arch_prctl`的说明：

```
ARCH_PRCTL(2)

NAME
    arch_prctl - set architecture-specific thread state

DESCRIPTION
    arch_prctl() sets architecture-specific process or
    thread state.  code selects a subfunction and passes
    argument addr to it; addr is interpreted as either
    an unsigned long for the "set" operations, or as
    an unsigned long *, for the "get" operations.

    Subfunctions for x86-64 are:

    ARCH_SET_FS
        Set the 64-bit base for the FS register to addr.
    ARCH_GET_FS
        Return the 64-bit base value for the FS register
        of the current thread in the unsigned long
        pointed to by addr.
    ARCH_SET_GS
        Set the 64-bit base for the GS register to addr.
    ARCH_GET_GS
       Return the 64-bit base value for the GS register
       of the current thread in the unsigned long pointed
       to by addr.
```

这是用来设定FS和GS寄存器的系统调用，功能简单明了。现在我们只要追踪一下这个调用在glibc的何处发生就可以知道具体信息了。

这可以在gdb中方便完成：

```
$ gdb foo
gef➤  catch syscall arch_prctl
Catchpoint 1 (syscall 'arch_prctl' [158])
gef➤  run

...

[#0] 0x7ffff7dd8ec5 → Name: init_tls()
[#1] 0x7ffff7ddbc1f → Name: dl_main()
[#2] 0x7ffff7df0740 → Name: _dl_sysdep_start()
[#3] 0x7ffff7dd9df8 → Name: _dl_start()
[#4] 0x7ffff7dd8f38 → Name: _start()
```

清晰的函数调用栈。这次我们只关心FS的设置，快速的查看一下`init_tls`函数：

``` c
// File: elf/rtld.c

static void *
init_tls (void){

  ...

  const char *lossage = TLS_INIT_TP (tcbp);
  if (__glibc_unlikely (lossage != NULL))
    _dl_fatal_printf ("cannot set up thread-local storage: %s\n", lossage);
  tls_init_tp_called = true;

  return tcbp;
}
```

`tcbp`是已经分配好的TLS结构，我们看一下`TLS_INIT_TP`宏：

``` c
// File: sysdeps/x86_64/nptl/tls.h

# define TLS_INIT_TP(thrdescr)                                            \
  ({ void *_thrdescr = (thrdescr);                                        \
     tcbhead_t *_head = _thrdescr;                                        \
     int _result;                                                         \
                                                                          \
     _head->tcb = _thrdescr;                                              \
     /* For now the thread descriptor is at the same address.  */         \
     _head->self = _thrdescr;                                             \
                                                                          \
     /* It is a simple syscall to set the %fs value for the thread.  */   \
     asm volatile ("syscall"                                              \
           : "=a" (_result)                                               \
           : "0" ((unsigned long int) __NR_arch_prctl),                   \
             "D" ((unsigned long int) ARCH_SET_FS),                       \
             "S" (_thrdescr)                                              \
           : "memory", "cc", "r11", "cx");                                \
                                                                          \
    _result ? "cannot set %fs base address for thread-local storage" : 0; \
  })
```

使用内联汇编执行syscal，并最终在内核中设定了FS的值。

事实上，FS寄存器仅仅是GDT的Segment Selector，并不是指针。但是汇编`fs:0x28`的效果和读指针是一样的。

关于GDT和FS的真正细节，会留到下一篇来说。

## 0x05 总结

重新理清顺序，在Glibc中，Canary的流程如下：

1. `init_tls`成功分配了TLS结构，将FS与TLS关联。
2. 在`__libc_start_main`中，TLS结构被具体内容填充(文中未列出)
3. 在`__libc_start_main`中，通过系统随机数发生器，生成了Canary
4. 在`THREAD_SET_STACK_GUARD`宏中，通过读写FS寄存器，将Canary写入TLS
5. 用户程序通过`fs:0x28`读取Canary

现在唯一让人困惑的就是为什么`fs:0x28`会有如此行为。但是这是内核部分的事情了，对于Glibc的Runtime来说，Canary的分析已经完成。

在下一篇文章中，我们将最终回答，Canary在内存中的存储位置。
