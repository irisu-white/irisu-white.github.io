---
tiitle: 利用Canary进行信息泄漏
date: 2017-02-09
tag: Bin
layout: post
---

## 0x00 stack-protect

为了防止栈溢出，系统层级一般会有三重默认保护：

* NX : 栈不可执行(rw-)
* ASLR : address space layout random, 地址随机化
* Canary : 栈保护

NX通过设置内存标志位禁止在栈上执行代码，防止了栈上执行shellcode。

ASLR为系统内核级的设置，会在初始化堆和栈时将地址随机进行偏移。即使发生了溢出，也会因为目标地址未知变得难以利用。

Canary则是在运行时进行栈检查。在栈帧初始化后系统会在栈帧上设置一个随机数值，并在ret时检查该数值。校验失败会使得程序强制退出(被kill掉)。因此即使有溢出存在，也不可能覆盖返回地址。

## 0x01 stack-check-fail

当canary校验失败时，会调用`__stack_chk_fail`函数，通常情况下会打印一条错误信息，然后结束程序。

该函数定义在glibc的`/debug/stack_chk_fail.c`中。

``` c
void __stack_chk_fail (void)
{
  __fortify_fail ("stack smashing detected");
}
```

只是简单的调用另一个函数进行信息打印。

`fortify_fail`定义在`/debug/fortify_fail.c`中。

``` c
void __fortify_fail (const char *msg)
{
  /* The loop is added only to keep gcc happy.  */
  while (1)
    __libc_message (2, "*** %s ***: %s terminated\n",
		    msg, __libc_argv[0] ?: "<unknown>");
}
```

`__libc_message`会进行错误信息的打印。

该函数定义在`/sysdeps/posix/libc_fatal.c`中。

``` c
void __libc_message (int do_abort, const char *fmt, ...)
{
  //设置输出流

  int fd = -1;

  /* Open a descriptor for /dev/tty unless the user explicitly
     requests errors on standard error.  */
  const char *on_2 = __libc_secure_getenv ("LIBC_FATAL_STDERR_");
  if (on_2 == NULL || *on_2 == '\0')
    fd = open_not_cancel_2 (_PATH_TTY, O_RDWR | O_NOCTTY | O_NDELAY);

  if (fd == -1)
    fd = STDERR_FILENO;

  //遍历变长参数表，对fmt字符串进行格式化输出
  ...
  ...

  //结束进程
  if (do_abort)
    {
      BEFORE_ABORT (do_abort, written, fd);

      /* Kill the application.  */
      abort ();
    }
}
```

在最后的函数中，会对环境变量`LIBC_FATAL_STDERR_`进行检查，若没有设置该环境变量或者设置为0，错误信息会默认输出到tty中，通常是当前的控制台。否则的话会将错误信息输出到stderr中。

在本地情况下stderr默认也是打印在终端中的，所以并无区别。但是在远程连接中，stderr会和stdout一样被对方接收，但是tty一定是在本地输出。

## 0x02 leak

所以在引发stack fail时，会输出一条固定的错误信息和程序名称(argv[0])。

如果我们可以通过一次栈溢出覆盖掉argv[0]，将其指向我们想泄漏的地址，那么在引发stack fail时目标地址的内容就会被输出。

由此，我们得到了一处message leak。

尤其是对于gets()这种函数，会非常容易成功。

需要注意的是，如果是非本地攻击，我们还需要在覆盖时设置环境变量`LIBC_FATAL_STDERR_`，否则不会接收到错误信息。

