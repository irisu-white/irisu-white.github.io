---
title: User, Process and Permission
date: 2018-05-15
tag: Game
layout: post
---

翻译自[users-perms-lec](http://haifux.org/lectures/84-sil/users-processes-files-and-permissions/users-perms-lec.html)

使用猴子方法进行翻译，能力有限，并且未完成。

## 介绍

* Linux是一个多用户系统，允许多个用户在一台机器上同时工作。

* 因此，我们需要分隔用户的机制 - 保证用户不会被其他人的工作干扰

* 接下来需要的机制是，允许用户间共享他们的工作

* 用户，进程与权限因此应运而生

* 注意：在此次演讲中，我们会在live system环境中演示示例。幻灯片中的示例是**不详细**的。

### User

* 用户由用户ID确定 - ID是一串数字

* 用户ID '0' 代表"root" - 最高权限的管理员

* 系统中的对象(进程，文件)与用户相关联。

* 其他衍生的东西也是如此

* 所有的用户都定义在"/etc/passwd"中。

### /etc/passwd

* 每个用户都在该文件中占据一行

* (然而，也能创建一个属于未定义用户的文件)

* 文件的每一行都由':'分割成以下部分：

    * 用户名
    * 密码 / 密码的存储位置(空 - 无密码；'x'：密码被隐藏 - 由"/etc/shadow"中的部分替代)
    * 用户ID(数字)
    * 默认用户组ID(稍后介绍)
    * 真实姓名(一些描述文本)
    * Home目录
    * Login Shell

### /etc/shadow

* 曾经，密码在"/etc/passwd"中以密文的方式进行存储

* 然而，该文件是全体可读的(也就是说，系统中的所有用户都可以并且必须可以阅读此文件)，所以导致了各种各样的攻击。

* 因此，如今的密码存储在"/etc/shadow"中，并且只有"root"用户可读。

* 文件的每一行由":"分割成以下部分：

    * 用户名
    * 密码(加密格式)
    * 日期变量，用于账户管理

### /etc/shadow (续)

* 如果要创建一个无密码用户，只要将用户的'密码'字段置空即可。

* 已加密的密码中不允许含有'\*'字符

* 因此，如果需要临时停用一个账户，只要在密码的开头加一个'\*'即可。

### 用户组

* 用户组由用户组ID确定 - 它也是一串数字

* 一个用户组可以含有0个或多个用户

* 系统中的对象(进程，文件)与用户相关联。

* 所有的用户组定义在"/etc/group"中。

* '默认用户组'除外，它有可能在"/etc/passwd"中隐式定义

### /etc/group

* 每个用户组(除默认用户组)都在该文件中占据一行。

* (当然，可以创建一个属于未定义用户组的文件)

* 文件的每一行由":"分割成以下部分：

    * 用户组名称
    * 密码 / 密码的存储位置(一般没有使用，含有一个'x') 
    * 用户组ID(数字)
    * 用户列表，由','分割(逗号字符)

## 用户，用户组和文件

* 系统中的每个文件都有自己的所有者

* 当用户创建一个新文件 - 这个文件就属于这个用户

* 文件也拥有一个"所属用户组"

* 文件的所属用户组，通常是文件所有者的默认用户组

* ...除非它不是(我们稍后会看到)

### 文件所有者

* 一个文件的所有者总是能够修改文件的权限

* ...除非这个用户不能访问包含此文件的目录

* 如果文件所有者持有的文件是一个可执行程序的话，事情也会变得更复杂一点 -- 我们稍后再说

## 文件访问权限

* 每个文件都有访问权限，定义了哪些用户可以使用它

* 目录也是文件的一种 - 所有它也有访问权限

* 为了访问一个文件，我们需要访问包含此文件的所有目录

* 例如，为了访问"/etc/passwd"，我们需要访问"/"目录，"/etc"目录，还有"/etc/passwd"本身

### 文件访问权限 - 谁可以访问？

* 访问权限分为3部分：所属用户，所属用户组，其他用户

* 如果访问者是文件所有者，只会检查"所属用户"权限

* 因此，如果一个文件对其他用户开放了权限，但是对所有者没有开放的话 - 它是不允许所有者访问的...

* ...但是我们已经说过了，文件所有者总是能修改文件的权限，所以他可以给予他自己访问文件的权利，然后访问文件

* 如果一个所属用户组内的用户(除去文件所有者)访问文件，会进行相似的检查(PS：检查"所属用户组"权限)

### 文件访问权限 - 做什么的权限？

* 访问权限被进一步的划分为3部分：读，写，执行

* 对文件来说，'读'代表有权查看文件的内容

* '写'代表有权修改文件内容

* '执行'代表有权执行(运行)文件，假设它是一个程序

### 目录访问权限 - 做什么的权限？

* 对目录来说，'读'代表有权查看目录内都有什么文件

* '写'代表有权在目录内新建文件

* '执行'代表有权访问目录内的文件

* 因此，为了能够读一个文件的内容，用户必须拥有包含此文件的全部目录的'执行'权限，以及文件本身的'读'权限

* 举例来说，为了读取文件"/etc/passwd"，用户必须拥有下列权限：

    * "/"目录的'x'权限
    * "/etc"目录的'x'权限
    * "/etc/passwd"文件的'r'权限

## 应用访问权限(Access Permission scenarios)

* 让我们试一下，如何使用上述文件和目录权限，达成以下的应用方案：

    * 在home目录中新建一个文件，任何人都有权读取
    * 将一个程序文件放在home目录的"bin"文件夹下，任何人都有权执行
    * 新建一个文件，只有指定的用户组内的用户有权读取
    * 新建一个文件，任何人都有权读取，但是指定用户组内的用户除外

### 将文件设置成任意可读

* 在home目录中新建一个文件，设置成任意人都有权读取

    * 在home目录中新建一个文件
    * 将"所有者"，"所属用户组"，"其他"设置为"可读"

            chmod a+r <file_name>

        (PS：'a'是"all"的简写 - 也就是"所有者"，"所属用户组"，"其他")

    * 将home目录的权限设置为'可执行'，让用户可以访问到home内的文件

            chomd a+x ~

        (PS：'~'是home目录的简写)

### 将'~/bin'内的文件设置为任意可执行

* 在home目录下的"bin"文件夹中新建一个文件，设置为任何人都有权执行

    * 将程序放置在home目录下的"bin"文件夹中
    * 将"所有者"，"所属用户组"，"其他"设置为'可执行'

            chmod a+x <file_name>

    * 将home目录的权限设置为'x'，让用户可以访问home目录下的"bin"文件夹

            chmod a+x ~

    * 将"bin"文件夹的权限设置为'x'，让用户可以访问到包含在里面的文件

            chmod a+x ~/bin

### 将文件设置为指定用户组可读

* 新建一个文件，设置为指定用户组中的用户可读

    * 让系统管理员新建一个用户组，将目标用户包含进来

        PS：我们的账户必须在用户组中，...

    * 将新用户组设置为文件的所属用户组

            chgrp <group_name> <file_name>

    * 将"所属用户组"设置为'可读'

            chmod g+r <file_name>

    * 确保"其他"用户没有权限读取文件

            chmod o-r <file_name>

    * 将home目录的权限设置为'x'，让用户可以访问包含在其中的文件

            chmod a+x ~

        PS：如果文件位于home目录下的子目录中，我们必须将所有包含文件的目录的权限设置为'x'

### 将文件设置为除指定用户组外任意可读

* 新建一个文件，设置为除指定用户组外的任何人都有权读取

    * 创建一个新的用户组，包含全部'禁止访问'的用户
    * 将文件的所属用户组设置为该用户组
    * 将"其他"的权限设置为'可读'，但是将'可读'权限从"所属用户组"中移除

## 用户与进程

* 在Linux上运行的每个进程都代表给定的用户执行。

* 因此，给定用户能做到的事情进程也能做到。

* 进程可以访问其用户所有者可以访问的文件。

* ...例外情况是当它访问其他文件时，我们稍后会看到。

* 每个进程都拥有唯一的进程ID(pid)。PID可以用来控制进程，我们稍后会看到。

### 查看正在运行的进程

* `ps`命令可以查看正在运行的进程。当我们不带参数运行它时，会得到类似下面的结果：

```
[choo@simey ~]$ ps
PID TTY          TIME CMD
1235 pts/3    00:00:00 tcsh
2014 pts/3    00:00:00 ps
```

* 输出结果被分割成如下几列：

    * PID - 进程ID
    * TTY - 运行此进程的"终端(terminal)" (如果没有则显示'?')
    * TIME - 进程消耗的CPU时间(小时，分钟，秒)
    * CMD - 进程执行的命令

### 查看正在运行的进程 - 宽格式

* 为了看到进程的更多细节，我们可以使用`u`参数运行`ps`：

```
[choo@simey ~]$ ps u
USER       PID %CPU %MEM   VSZ  RSS TTY      STAT START   TIME COMMAND
choo      1235  0.0  0.5  2856 1444 pts/3    S    14:42   0:00 -csh
choo      2061  0.0  0.3  2624  776 pts/3    R    18:43   0:00 ps u
```

* 输出被分割成下面几列：

    * USER - 运行此进程的用户
    * PID - 进程ID
    * %CPU - 进程使用的CPU时间比例
    * %MEM - 进程使用的内存(物理内存)比例
    * VSZ - 进程使用的虚拟内存
    * RSS - 进程使用的物理内存
    * TTY - 运行此进程的"终端(terminal)" (如果没有则显示'?')
    * STAT - 进程的状态：

        * S - 睡眠中
        * R - 正在运行(至少在一个CPU中)
        * D - 非中断睡眠(一个进程长时间处于此状态是非常糟的)。处于此状态的进程不可被终止或挂起。
        * T - 被跟踪或被挂起
        * Z - 僵死(进程已退出)

    * TIME - 进程消耗的CPU时间(小时，分钟，秒)
    * CMD - 进程执行的指令

### 查看正在运行的进程 - 变体

* 查看运行在当前shell的全部进程：

```
ps
```

* 查看我们已经运行的全部进程：

```
ps x
```

* 查看某个用户运行的全部进程：

```
ps -u <user_name>
```

* 查看系统中正在运行的全部进程：

```
ps ax
```

* 查看某个PID(进程ID)指定的进程：

```
ps -p <pid>
```

## 控制进程

* 用户只能控制属于自己的进程

* ...除非用户是"root" - 它可以控制运行在系统中的任意进程

* ...假定一个进程没有处于非常"僵硬"的状态。

* 使用PID(进程ID)终止一个进程：

```
kill <pid>
```

* 终止一个"顽固"的进程(当普通的终止指令失败时)：

```
kill -9 <pid>
```

* 暂时挂起一个进程：

```
kill -STOP <pid>
```

* 恢复一个被挂起的进程：

```
kill -CONT <pid>
```

## 进程与文件

* 如同之前看到的一样，进程可以打开文件

* 进程打开文件后可以进行读，写，或者同时进行。

* 进程操作文件完毕后，通常会关闭文件。

* 进程终止时，操作系统会确保所有打开的文件被正常关闭。

* 文件被进程打开后，如果我们删除文件，文件只在目录中被移除，磁盘中的文件仍然被保留。只有当进程关闭文件后，文件才会从磁盘中删除。

