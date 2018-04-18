---
title: 在Arch Linux中编译Glibc
date: 2018-04-17
tag: CS
layout: post
---

Arch Linux对于快速折腾各种新东西是非常方便的。作为一个纯粹的桌面端Linux环境，稳定性完全可以给易用性让步。

但是过快的版本更新也使得我们没有办法获得一个稳定的调试环境：我们有的时候需要旧版本，或者需要重新指定其中的编译选项，或者编译一份no-strip版本。

## 获取PKGBUILD

Arch Linux为了方便定制，拥有自己的[ABS(Arch Build System)][1]系统。我们只需要根据Wiki安装合适的工具来获取PKGBUILD文件即可。我选择的是熟悉的git：

```
$ sudo pacman -S asp
```

使用asp工具，我们可以方便的从源编译仓库获取需要的软件包。

```
$ cd ~
$ mkdir build & cd build
$ asp checkout glibc
```

一番等待后，我们就会在目录下找到包含PKGBUILD(以及附属文件)的文件夹。

通常我们会在其中找到两个文件夹：repos和trunk。

* repos: 稳定版本
* trunk: 开发者版本

对于一般编译来说，追踪稳定版本即可。

## 切换到旧版本

asp使用的是git仓库组织PKGBUILD。使用`git checkout`即可切换到相关的旧版本。

我们可以用下面的git命令来对具体的文件进行追踪：

```
$ git log --follow repos/core-x86_64/PKGBUILD
```

对稳定版的日志追踪很艰难，因为不含有版本信息。我们可以通过追踪开发者版本(trunk文件夹)，然后推算稳定版的commit日期。

最后记得检查PKGBUILD中的版本号，以确定细节。

## 修改PKGBUILD

关于PKGBUILD，可以参考Arch Wki的详细页面：[PKGBUILD - ArchWiki][2]

如果需要patch源码本身，可以参考这个页面：[Patching packages - ArchWiki][3]

关于编译Debug版本，可以参考这个页面：[Debug - Getting Traces - ArchWiki][6]

我们可以使用`makepkg`来获取源码：

```
$ makepkg -o
```

我本次的编译目的是关闭gllibc-2.26中新引入的tcach机制。通过在glibc源码中运行`./configure --help`，以及追踪tcach的[commit信息][4]，我找到了关闭方法：

```
The patch re-enables the "experimental malloc" configure option, and
defaults it to "yes".  Disabling it disables the tcache code.

  --disable-experimental-malloc
        disable experimental malloc features
```

只需添加一项编译参数即可完成。在PKGBUILD中可以找到这样一段：

``` bash
build() {
  local _configure_flags=(
      --prefix=/usr
      --with-headers=/usr/include
      --with-bugurl=https://bugs.archlinux.org/
      --enable-add-ons
      --enable-bind-now
      --enable-lock-elision
      --enable-multi-arch
      --enable-obsolete-nsl
      --enable-obsolete-rpc
      --enable-stack-protector=strong
      --enable-stackguard-randomization
      --disable-profile
      --disable-werror
  )
```

所以我们只需要在`_configure_flags`中添加一句`--disable-experimental-malloc`即可。

## 进行编译

使用makepkg进行编译即可。关于makepkg，可以参考：[makepkg - ArchWiki][5]

如果还没有下载源码，使用：

```
$ makepkg -sr
```

如果之前已经运行了`makepkg -o`那么直接执行编译即可：

```
$ makepkg -e
```

接下来要做的就是等待。在我的i7-8G电脑上，使用了一个小时完成了glibc的编译。

如果需要安装，使用`sudo pacman -U package-name`。如果需要单独文件，在pkg目录下可以找到编译好的文件。

## 其他事情

最终我获得了一份关闭tcache的glibc-2.26。为了不影响日常的使用，我决定用`LD_PERLOAD`完成编译环境。

这是我的测试结果：

``` c
// File: foo.c
// Build: gcc -o foo -std=c99 foo.c

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void){
    long *a, *b, *c;

    a = malloc(0x100);
    b = malloc(0x100);
    c = malloc(0x100);

    memset(a, 0x0, 0x100);
    memset(b, 0x0, 0x100);
    memset(c, 0x0, 0x100);

    free(a);
    free(c);

    printf("%#x : %#x\n", a[0], a[1]);
    printf("%#x : %#x\n", c[0], c[1]);

    return 0;
}
```

使用`LD_PERLOAD`对比测试：

```
$ ./foo
0 : 0
0xf1ef0260 : 0
$ export LD_PRELOAD=~/build/bins/libc-2.26.so
$ ./foo
0xe1b07ae0 : 0xe1b07ae0
0x31657830 : 0x3a203065
```

获得了成功。


[1]: https://wiki.archlinux.org/index.php/Arch_Build_System
[2]: https://wiki.archlinux.org/index.php/PKGBUILD
[3]: https://wiki.archlinux.org/index.php/Patching_packages
[4]: https://sourceware.org/ml/libc-alpha/2017-01/msg00524.html
[5]: https://wiki.archlinux.org/index.php/Makepkg
[6]: https://wiki.archlinux.org/index.php/Debug_-_Getting_Traces

