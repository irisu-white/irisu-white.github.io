---
title: 在Linux中配置zsh
date: 2018-03-23
tag: CS
layout: post
---

zsh是Linux中非常强大的bash.但是只有zsh是不够的,我们需要oh-my-zsh等插件辅助我们的日常使用.

## oh-my-zsh

[Github地址](https://github.com/robbyrussell/oh-my-zsh)

oh-my-zsh几乎是zsh使用中必装的辅助工具之一,非常强大而且好用.自带的无数种主题可以让Terminal更方便易用.

首先需要前置:

* zsh
* git
* curl / wget 二选一

使用curl进行安装:

```
sh -c "$(curl -fsSL https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh)"
```

使用wget安装:

```
sh -c "$(wget https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh -O -)"
```

等待完成即可.第一次安装结束后,使用exit会退回到原始的bash界面.重启Terminal即可.

在`.zshrc`中可以配置主题和alias等.

## autojump

[Github地址](https://github.com/wting/autojump)

快速跳转程序,方便易用.长期使用可以快速的在新打开的Terminal中移动到需要的位置中,节省重复输入cd的时间.

其实这个程序本身和zsh无关.

如果是Arch Linux,可以直接从官方软件仓库中安装: `sudo pacman -S autojump`

如果是Max用户,使用brew即可进行安装: `brew install autojump`

也可以使用源码安装:

```
$ git clone git://github.com/joelthelion/autojump.git
$ cd autojump
$ ./install.py
```

无论如何,最后在`.zshrc`中添加下面的代码:

```
[[ -s ~/.autojump/etc/profile.d/autojump.sh ]] && . ~/.autojump/etc/profile.d/autojump.sh
```

日常使用: `j your_dir`

具体内容可以参见github中的README

## autosuggestions

[Github地址](https://github.com/zsh-users/zsh-autosuggestions)

zsh的插件,在输入命令时自动提示补全.

要补全的命令部分以灰色显示,按右方向键即可补全完整.bash自身的快捷键`Ctrl-f`与右方向键相等.

前置:

* zsh >= 4.3.11

直接从源码安装即可:

```
git clone https://github.com/zsh-users/zsh-autosuggestions ~/.zsh/zsh-autosuggestions
```

之后在`.zshrc`中添加插件:

```
plugins = (zsh-autosuggestions)
```

PS: zsh有多个插件时,plugins的条目是这样的: `plugins = (git zsh-autosuggestions)`

## 仿真Windows的cls命令

如果需要的话,可以使用`tput`命令.

在`.zshrc`中添加一句alias即可:

```
alias cls="tput reset"
```

具体内容可以参考`man tput`


