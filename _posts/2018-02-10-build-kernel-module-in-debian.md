---
title: 在Debian中搭建内核模块编译环境
date: 2018-02-10
tag: CS
layout: post
---

内核模块(kernel module)的编译环境配置会根据发行版的不同而不同，即使是Ubuntu和Debian也可能有细微的区别。

## 0x00 安装软件包

对于Debian来说，只需要安装Linux Header即可进行module的编译。

``` shell
$ sudo apt-get install linux-headers-$(uname -r)
```

如果需要内核源码，可以参考链接2。

## 0x01 编译module

进行简单的编译测试。

准备hello.c


``` c
#include <linux/module.h>
#include <linux/kernel.h>

MODULE_LICENSE("Dual BSD/GPL");

static int hello_init(void){
    printk(KERN_ALERT "Hello, world\n");

    return 0;
}

static void hello_exit(void){
    printk(KERN_ALERT "Exit, module.\n");
}

module_init(hello_init);
module_exit(hello_exit);
```

内核模块的编译重点在Makefile上。需要注意的是，make对应的makefile文件的名称必须为**Makefile**，全部小写的makefile是不行的。


``` shell
# File name: Makefile

obj-m := hello.o
KERNELDIR ?= /lib/modules/$(shell uname -r)/build
PWD := $(shell pwd)

all:
    $(MAKE) -C $(KERNELDIR) M=$(PWD) modules

clean:
    $(MAKE) -C $(KERNELDIR) M=$(PWD) clean
```

除了使用modules参数构建模块之外，我们还可以使用clean参数方便的配置清理函数。

在hello.c的所在目录执行`make`进行编译即可。

详细信息参考链接3。《Linux设备驱动程序》中的Makefile更认真一些。

## 0x02 其他

在更新内核版本后,`uname -r`会发生变动,导致Makefile使用的`/lib/modules/$(shell uname -r)/build`指向新的内核构建目录.

但是linux-header的安装包同样是使用`uname -r`安装的,并不会随着内核更新同步更新(事实上你可以使用apt安装任意版本的linux-header).

解决办法是安装新的linux-header,即重新执行步骤0x01即可.

保留旧的linux-header安装包不会产生问题,或者也可以选择卸载它(如果使用上面的Makefile的话,旧包今后也不会被使用了).

PS: Arch Linux的linux-header会随着内核版本自动同步,但是Debian不行.

## 0x03 参考链接

1. [How to install kernel headers on Linux][1]
2. [How to install full kernel source on Debian or Ubuntu][2]
3. [Build Linux Kernel Module Against Installed Kernel w/o Full Kernel Source Tree][3]

[1]: http://ask.xmodulo.com/install-kernel-headers-linux.html
[2]: http://ask.xmodulo.com/install-full-kernel-source-debian-ubuntu.html
[3]: https://www.cyberciti.biz/tips/build-linux-kernel-module-against-installed-kernel-source-tree.html


