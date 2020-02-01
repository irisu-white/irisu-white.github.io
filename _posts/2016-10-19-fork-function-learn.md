---
title: Linux 中的fork()函数
date: 2016-10-19 18:58:33
tag: Bin
layout: post
---

## 0x00 开始

程序启动，便会建立一个相应的进程。进程包括代码，数据，堆，栈...其实就是这个程序本身。

程序一般都是顺序执行的，也就是不能同时做两件事。但是有些时候需要做点额外的事，比如一个服务器程序：和客户端建立连接，然后通信，这时就不能和别的客户端连接了...

所以，世界需要额外的事，于是子进程运应而生（雾）

fork()函数做的就是这件事，不是多线程(多线程也是程序在做一样的事)，而是复制一个进程，相当于分身。然后这个分身去做额外的事，比如那个服务器程序：建立连接->fork一个自己->分身去通讯->自己接着等待另一个客户端来建立连接。

这次主要是从一个博客Link过来的。恩...

<!--more-->

## 0x01 fork()

talking is weak，先看函数原型：

```c
pid_t fork( void);
```

* pid\_t 是一个宏定义，其实质是int 被定义在`#include<sys/types.h>`中
* 返回值： 若成功调用一次则返回两个值，子进程返回0，父进程返回子进程ID；否则，出错返回-1

很简单的函数。如前面所说，一个进程调用fork()后，系统先进行资源分配，然后把父进程(调用fork的进程)的内容全部复制进子进程中，包括代码。所以就是个镜像实体。

从别处copy一个栗子：

```c
#include <unistd.h>
#include <stdio.h> 
int main () 
{ 
    pid_t fpid; //fpid表示fork函数返回的值
    int count=0;
    fpid = fork(); 
    
    if (fpid < 0) 
        printf("error in fork!"); 
    else if (fpid == 0) {
        printf("i am the child process, my process id is %d/n",getpid()); 
        count++;
    }
    else {
        printf("i am the parent process, my process id is %d/n",getpid()); 
        count++;
    }
    printf("Result: %d/n",count);
    return 0;
}
```

然后结果是：

```bash
i am the child process, my process id is 5574
Result: 1
i am the parent process, my process id is 5573
Result: 1
```

乍一看好像理所当然，复制了一个进程嘛。但是仔细看却是interesting：它是怎么控制输出不同的信息的？

再看前面的函数原型，其实返回值这一条很有趣：**"若调用成功一次会返回两个值"**。没错，fork()最大的特点就在这里了。因为fork()之后会产生两个一样的进程，所以会分别对父进程和子进程返回一个值。

**返回值：**

* 子进程：返回0（永远是返回0）
* 父进程：返回子进程的PID（PID即进程ID）
* REEOR：返回值小于0

在运行到fork()之前，只有一个进程在执行。fork()之后，产生子进程并返回了PID。如果程序之后也是普通的代码（不去根据PID判断什么），那么就是两个一样的程序在跑。在例子中，进行了PID判断，也就是判断了父子进程，判断之后，父子进程进入不同的条件分支，相当于两个进程分道扬镳，从此不同了。

所以喽，最后输出了不一样的信息。

**PS：getpid()函数用于获取自己进程的PID。**

## 0x02 其他

### ERROR？

之前写了，如果发生错误，会返回小于零的值。代码中检查`if(fpid<0)`的原因，就是进行错误检查。

**以下是ERROR的情况：**

* 当前的进程数已经达到了系统规定的上限，这时errno的值被设置为EAGAIN。
* 系统内存不足，这时errno的值被设置为ENOMEM。

### 父进程，子进程？

这里说一下，父子进程是相对的：每次调用fork()，调用者为父进程，新建立的进程为子进程。

也就是说，如果fork一个子进程后（产生了子进程1），该子进程也调用fork()，那么相对于新产生的子进程2，它是父进程（子进程1是子进程2的父进程。原进程是子进程1的父进程。就是孩子，父亲和爷爷）。

**这两个函数用于获取PID：**

* getpid()：获取自己进程的PID
* getppid()：获取自己的父进程的ID

### 优先性？

fork()后，那个进程先进行呢？

**随机的。可以理解为运行了两个程序，看CPU怎么调度喽**

### 文件问题

**特别的是，fork后父子进程会共享一个文件表。也就是说，父进程打开的文件子进程也是可以读取的...**

## 0x03 Copy-on-write：写时复制

fork是Linux下的关键和常用函数之一，所以针对它也进行了优化。其实这和exec有关。

(实际上是没关的...提到exec只是举个栗子而已)

### EXEC

简单来说，exec()做的事就是打开另一个新程序，然后把新程序的所有内容（代码，数据，栈，堆...）都覆盖到自己的进程中，但是PID不变。本质上说就是灭了自己，然后执行了新程序，不过PID等外表信息不变。

**PS：exec实际上是6个，exec只是统称，详细内容另行查看**

Linux内一个没有用的进程，经常就以exec方式销毁并启动另一个有用的新程序。另一个常用方法便是：fork一个子进程，然后子进程exec。相当于一个进程去启动了一个新程序（也是做点额外的事233，比如还是服务器程序，连接后直接fork和exec启动新程序，把连接好的客户端交给新程序，自己继续等待连接）。

fork会在创建子程序的时候完全复制原进程的信息。这样的话，如果fork后直接exec了，岂不是很浪费？（还是经常很浪费）

所以，世界也需要节约性能，于是COW(copy-on-write)运应而生（雾+1）

### copy-on-write(写时复制)

按字面意思，就是"写"的时候才进行复制(废话)。其实就是这样。

当fork之后，其实并没有发生复制，只是系统给子进程分配了虚拟地址空间，代码，数据，栈，堆...等都指向原进程，并且原进程的数据全部被设置为只读。一旦父进程进行数据修改，此时系统才会给子进程分配相应的空间，进行修改部分数据的复制。

这样的话就可以节省资源了。fork后没有复制，然后exec，再然后...子进程完全变了样，和父进程毫无关联，永远不需要复制信息了。

## 0x04 Link

都说了是主要是个Link...

其中还记录了多次循环fork的烧脑分析以及公式：[这是地址][link]

**--End--**

[link]: http://blog.csdn.net/jason314/article/details/5640969
