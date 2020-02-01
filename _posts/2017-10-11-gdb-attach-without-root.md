---
title: 非root权限进行gdb attach调试
date: 2017-10-11
tag: CS
layout: post
---

默认系统内核参数kernel.yama.ptrace设置为1(True)，此时普通用户进程是不能对其他进程进行attach操作的。

除非使用root权限，或者被附加进程是调试器的子进程。

可以关掉此项保护：

```bash
# When system use systemd
sudo sysctl kernel/yama/ptrace_scope=0

# Other, change file
# file /etc/sysctl.d/10-ptrace.conf
kernel.yama.ptrace-scope = 0
```

相关文章：

- ArchLinux Wiki：[Security/ptrace\_scope](https://wiki.archlinux.org/index.php/Security#ptrace_scope)
- AskUbunto：[after upgrade gdb won't attach to process](https://askubuntu.com/q/41629)

