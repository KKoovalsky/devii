---

title: Cross compiling C++ Project for ARM Cortex M with CMake and Clang
subtitle: Yet another way of doing this again.
published: true
datePublished: 1589064522569
author: Kacper Kowalski
tags:
  - Embedded
  - CMake
  - Clang
  - C++
  - LLVM
  - ARM Cortex M
  - STM32
  - ARM GNU GCC Toolchain
authorPhoto: /img/profile.jpg
bannerPhoto: /img/brook.jpg
thumbnailPhoto: /img/brook.jpg
canonicalUrl: https://jungles.emb.dev/blog/cross_compile_arm_cortex_with_clang_and_arm_gnu_gcc

---

Cross-compiling a C project for ARM Cortex M platform using Clang, is quite easy. There are multitude of guides out
there. C++ is another thing, especially when uncommon things for the Embedded field are involved, like exceptions, or
RTTI. This post will guide you through the process, and explain all the details. The setup is:

* CMake 3.21 - the build system.
* an ARM Cortex M MCU - STM32L432KC is used as a base.
* LLVM+Clang 14.0.0 - the compiler and other tools.
* ARM GNU GCC Toolchain 10.3-2021.10 - libc, compiler runtime and friends.

---

The main post contains dismembered peaces of CMake code, to keep the flow of explanation. At the end of this page
there is a simplified [TLDR](#TLDR) guide, which contains only steps to be done, without getting into the details.

## The layout

To make our project well-structured, we should group files by its purpose. Having that in mind, all the guidelines
here will assume that the main `CMakeLists.txt` is put under the project root directory, and all the helper
CMake scripts are put under `\<project root dir\>/cmake`.

## The CMake Toolchain file

The entry point for any cross-compilation with CMake is the CMake Toolchain file, so let's blindly create a basic 
one, with name `clang_with_arm_gnu_libs_device_toolchain.cmake`:

```
set(CLANG_COMPILER_PATH_PREFIX ${LLVM_TOOLCHAIN_PATH}/bin)

# Without that you will get linking error related to no _exit symbol when CMake tests the compiler.
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

set(CMAKE_SYSTEM_NAME Generic)

set(CMAKE_C_COMPILER ${CLANG_COMPILER_PATH_PREFIX}/clang)
set(CMAKE_CXX_COMPILER ${CLANG_COMPILER_PATH_PREFIX}/clang++)

set(CMAKE_ASM_COMPILER ${CLANG_COMPILER_PATH_PREFIX}/clang)
set(CMAKE_LINKER ${CLANG_COMPILER_PATH_PREFIX}/lld)

set(CMAKE_AR ${CLANG_COMPILER_PATH_PREFIX}/llvm-ar)
set(CMAKE_OBJCOPY ${CLANG_COMPILER_PATH_PREFIX}/llvm-objcopy)
set(CMAKE_RANLIB ${CLANG_COMPILER_PATH_PREFIX}/llvm-ranlib)
set(CMAKE_STRIP ${CLANG_COMPILER_PATH_PREFIX}/llvm-strip)
set(CMAKE_SIZE ${CLANG_COMPILER_PATH_PREFIX}/llvm-size)

```

As you can see I have introduced an `LLVM_TOOLCHAIN_PATH` variable, which is not set at this stage, so most probably
we have to provide it somewhere else.

This is a bit offtopic, but quite a necessary issue - the dependencies. We could provide the `LLVM_TOOLCHAIN_PATH`
in two ways:

* download it "by hand" and call cmake with `LLVM_TOOLCHAIN_PATH` set to the downloaded path:

```
# Download the LLVM+Clang toolchain under path: path/to/llvm+clang
cmake -DLLVM_TOOLCHAIN_PATH=path/to/llvm+clang path/to/source/dir
```

* download it automatically and set the `LLVM_TOOLCHAIN_PATH` from the top-level CMake file, using `FetchContent` 
module.

I prefer much more the second approach. Let me explain why.

## Downloading the toolchain automatically

At the stage of invoking the toolchain file during the CMake configure step, we need the `LLVM_TOOLCHAIN_PATH` to be
already set. So, when does CMake load the toolchain file? Assuming that we have run CMake configure and generate step
like that:

```
mkdir build && cd build/
cmake -DCMAKE_TOOLCHAIN_FILE=../cmake/clang_with_arm_gnu_libs_device_toolchain.cmake ..
```

The toolchain file will be loaded before evaluation of the `project()` function. It means that we have quite a space
where we could prepare our project for the invocation of the toolchain file. What's cool is that `FetchContent` module
works before the evaluation of `project()`, so we can make use of it to download the LLVM toolchain.

Let's create a `dependencies.cmake` file with a function like that:

```
function(ProvideLlvm)
    include(FetchContent)
    FetchContent_Declare(
        Llvm
        URL https://github.com/llvm/llvm-project/releases/download/llvmorg-14.0.0/clang+llvm-14.0.0-x86_64-linux-gnu-ubuntu-18.04.tar.xz
        URL_HASH SHA256=61582215dafafb7b576ea30cc136be92c877ba1f1c31ddbbd372d6d65622fef5
    )
    FetchContent_MakeAvailable(Llvm)
    FetchContent_GetProperties(Llvm SOURCE_DIR LLVM_TOOLCHAIN_SOURCE_DIR)
    set(LLVM_TOOLCHAIN_PATH "${LLVM_TOOLCHAIN_SOURCE_DIR}" CACHE PATH "Path to the LLVM toolchain") 
endfunction()
```

Make sure to replace the `URL` with the URL to the LLVM Toolchain for your host architecture, and `URL_HASH` 
correspondingly.

Then, we have to actually make it happen, thus, invoke the function from the main `CMakeLists.txt`, before the call to
`project()`:

```
# Append our 'cmake/' directory to the CMAKE_MODULE_PATH, so that it will be easier to call 'include(MODULE)'.
list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_LIST_DIR}/cmake)
include(dependencies)
ProvideLlvm()
```

To make the things even easier, let's set the default `CMAKE_TOOLCHAIN_FILE`

```
set(CMAKE_TOOLCHAIN_FILE ${CMAKE_CURRENT_LIST_DIR}/cmake/clang_with_arm_gnu_libs_device_toolchain.cmake CACHE PATH
    "Path to the CMake's toolchain file")

project(YourProjectName LANGUAGES CXX C ASM)
```

After this is done, we can invoke the CMake configure and generate step as simple as that:

```
mkdir build && cd build/
cmake ..
```

All the (so far) needed dependencies will be downloaded for us, and the custom toolchain file will be pulled all 
together.

Let me get into the details a bit. We have set `LLVM_TOOLCHAIN_PATH` to the source directory of the downloaded LLVM 
toolchain within the function `ProvideLlvm`, so this is checked. We ensured that the custom toolchain file will be
used. Still, we have left the `CMAKE_TOOLCHAIN_FILE` a CACHE variable, therefore we can still manually overwrite
it from the command line.

Why I prefer using `FetchContent` to fetch even the toolchain:

* Obviously, it's an automatic approach. We benefit from it when introducing a new engineer into the project, by
simplifying the onboarding. The initial setup is quicker and the building command is shorter. Less scripting when
creating a pipeline, etc.
* `FetchContent` allows you to provide the source location, consequently, skipping the downloading and updating, as
it may be costly, since the LLVM Toolchain is quite heavy. One can provide a local installation to the LLVM+Clang
by invoking CMake with `-DFETCHCONTENT_SOURCE_DIR_LLVM=path/to/local/llvm+clang` with the first run. See 
[its documentation](https://cmake.org/cmake/help/latest/module/FetchContent.html#variable:FETCHCONTENT_SOURCE_DIR_%3CuppercaseName%3E)
for more details.

It looks tempting to call the `ProvideLlvm()` from the toolchain file, but it is not a good approach, because
each time `try_compile()` is called the toolchain file is re-evaluated. `try_compile()` performs a build on the side
so the dependencies will not be cached, thus `FetchContent` will no be prevented from redownloading the dependencies.
Don't do that!

## Bringing the compile flags

You might have already noticed that there is the major part still missing. The compiler flags. Let's append them
to our toolchain file:

```
# Targeting ARM Cortex M4 with FPU support (STM32L432KC).
set(basic_architecture_flags 
    "-mthumb -mcpu=cortex-m4 -mfloat-abi=hard -mfpu=fpv4-sp-d16")

set(basic_flags "${basic_architecture_flags} -fdata-sections -ffunction-sections")
```

Tweak the `basic_architecture_flags` for your architecture. What you need to find out is the CPU architecture and the
floating point unit, if any. If no floating point unit is supported on your microcontroller, then use `-mfloat-abi=soft`
and drop the `-mfpu` flag.

We need now to set the variable which CMake expects to be set within the toolchain file:

```
set(CMAKE_C_FLAGS_INIT "${basic_flags}")
set(CMAKE_ASM_FLAGS_INIT  "${basic_architecture_flags}")
set(CMAKE_CXX_FLAGS_INIT "${basic_flags}")

set(CMAKE_C_COMPILER_TARGET arm-none-eabi)
set(CMAKE_CXX_COMPILER_TARGET arm-none-eabi)
set(CMAKE_ASM_COMPILER_TARGET arm-none-eabi)
```

The `*_INIT` group of flags is used by CMake to create the `CMAKE_<LANG>_FLAGS`, which are, in turn, used to compile
source files. The `*_TARGET` group of flags are special flags used when CMake and Clang are used together. This is 
a way to tell `clang`, that we are cross compiling.

Cool! We have a basic toolchain file. Now if you try to compile a basic C source file using `add_executable()` command,
it, obviously, will not work. You'll get bunch of errors:

> ld.lld: error: unable to find library -lc  
> ld.lld: error: unable to find library -lm  
> ld.lld: error: unable to find library -lclang_rt.builtins-arm  

This means that we are missing the standard libraries! For C++ source file, you'll get instead:

> ld.lld: error: unable to find library -lc++  
> ld.lld: error: unable to find library -lc++abi  
> ld.lld: error: unable to find library -lunwind  
> ld.lld: error: unable to find library -lc  
> ld.lld: error: unable to find library -lm  
> ld.lld: error: unable to find library -lclang_rt.builtins-arm  

Moreover, if you try to include some standard library, e.g. `#include <string>`, you will get:

> fatal error: 'string' file not found

Let's resolve that!

## The standard libraries

There is a reason why the ARM GNU GCC Toolchain is also listed at the beginning of the post. We will grab the 
precompiled standard libraries from it, because we are lazy. Yet, there is another approach for that: we can compile
the standard libraries from sources or get them from a place where somebody deployed it for us. [I have created such a
project](https://github.com/KKoovalsky/LlvmCrossCompileArmCortexM/releases/tag/v0.1.1), but let proceed with a 
more reliable solution. (Later on - in a next guide - I might show how to use the other approach).

The ARM GNU Toolchain contains `libc.a`, `libm.a` and friends, as well as standard C++ libraries and compiler runtime
(`libgcc.a`, `crt*` stuff), cross-compiled for each Cortex-M architecture. We can retrieve it from there and make
use of it. To do that I have created an 
[utility file](https://github.com/KKoovalsky/CrossCompileArmCortexMWithCMakeAndClangAndArmGnuToolchainLibs/blob/main/cmake/arm_gnu_toolchain_utils.cmake)
, which will retrieve proper paths for the specific architecture. The file contains four main CMake functions:

```
ArmGnu_GetCSystemIncludeFlags(basic_architecture_flags result_out_var)
ArmGnu_GetCxxSystemIncludeFlags(basic_architecture_flags result_out_var)
ArmGnu_GetStandardLibrariesDirectory(basic_architecture_flags result_out_var)
ArmGnu_GetCompilerRuntimeLibrariesDirectory(basic_architecture_flags result_out_var)
```

which expect the basic architecture flags (the same as set with the `${basic_architecture_flags}` variable) as the 
first parameter. The second parameter is the variable that will be set as the result, AKA returned value.

But before I get into the details, we need to pull the proper ARM GNU GCC Toolchain to the project. I will do it the 
same way as for the LLVM Toolchain. We create a function, which will download it for us, and set a CACHE variable, with
the source directory.

```
function(ProvideArmGnuToolchain)
    include(FetchContent)
    FetchContent_Declare(
        ArmGnuToolchain
        URL https://developer.arm.com/-/media/Files/downloads/gnu-rm/10.3-2021.10/gcc-arm-none-eabi-10.3-2021.10-x86_64-linux.tar.bz2
        URL_HASH MD5=2383e4eb4ea23f248d33adc70dc3227e
    )
    FetchContent_MakeAvailable(ArmGnuToolchain)
    FetchContent_GetProperties(ArmGnuToolchain SOURCE_DIR ARM_GNU_TOOLCHAIN_SOURCE_DIR)
    set(ARM_GNU_TOOLCHAIN_PATH "${ARM_GNU_TOOLCHAIN_SOURCE_DIR}" CACHE PATH "Path to the ARM GNU toolchain")
endfunction()
```

The call to it should go somewhere around the call to `ProvideLlvm()`, namely, just after it:

```
# Append our 'cmake/' directory to the CMAKE_MODULE_PATH, so that it will be easier to call 'include(MODULE)'.
list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_LIST_DIR}/cmake)
include(dependencies)
ProvideLlvm()
ProvideArmGnuToolchain()
```

It looks a bit shady so far, but let me explain myself. 

### The standard includes

Firstly, we need the system include flags both for C and C++. Unfortunately, we can't use `--sysroot` flag. 
If we use `--sysroot=path/to/arm_gnu_toolchain/arm-none-eabi`, then the include 
flags will be, indeed, resolved correctly, but in turn CMake will also propagate the `--sysroot` flag to the linker 
invocation. We don't want that. I will elaborate on that in the next section. 

How to get the proper system include flags in the first place? This is when the `ArmGnu_GetC*SystemIncludeFlags` 
functions can help us. They scrap the system include paths used by the ARM GNU GCC for the specific architecture.
The functions call `arm-none-eabi-cpp`, from the ARM GNU Toolchain, with
`${basic_architecture_flags} -xc* -v -E -` flags. This prints out a bunch of metadata about the compile process.
What's necessary for us are the standard include paths. This is how the dump goes pretty much:

```
Using built-in specs.
COLLECT_GCC=../armgnutoolchain-src/bin/arm-none-eabi-cpp
Target: arm-none-eabi
Configured with: /mnt/workspace/workspace/ ...
Thread model: single
Supported LTO compression algorithms: zlib
gcc version 10.3.1 20210824 (release) (GNU Arm Embedded Toolchain 10.3-2021.10) 

blablabla

#include <...> search starts here:
 /home/kacper/armgnutoolchain-src/arm-none-eabi/include/c++/10.3.1
 /home/kacper/armgnutoolchain-src/arm-none-eabi/include/c++/10.3.1/arm-none-eabi
 /home/kacper/armgnutoolchain-src/arm-none-eabi/include/c++/10.3.1/backward
 /home/kacper/armgnutoolchain-src/lib/gcc/arm-none-eabi/10.3.1/include
 /home/kacper/armgnutoolchain-src/lib/gcc/arm-none-eabi/10.3.1/include-fixed
 /home/kacper/armgnutoolchain-src/arm-none-eabi/include
End of search list.
```

To get off the details, we need to incorporate the include flags to the compiler flags. Before setting 
`CMAKE_*_FLAGS_INIT`, we get the include directories:

```
include(${CMAKE_CURRENT_LIST_DIR}/arm_gnu_toolchain_utils.cmake)
ArmGnu_GetCSystemIncludeFlags(${basic_architecture_flags} c_system_includes)
ArmGnu_GetCxxSystemIncludeFlags(${basic_architecture_flags} cxx_system_includes)
```

And then we change the `*_INIT` flags:

```
set(CMAKE_C_FLAGS_INIT "${basic_flags} ${c_system_includes}")
set(CMAKE_ASM_FLAGS_INIT  "${basic_architecture_flags}")
set(CMAKE_CXX_FLAGS_INIT "${basic_flags} ${cxx_system_includes}")
```

Of course, this will not work yet. As I have mentioned earlier in this article, `try_compile()` command sets up
an on-side build. In turn, no cache variable will be derived from the main build. Inside `arm_gnu_toolchain_utils.cmake` 
the variable `ARM_GNU_TOOLCHAIN_PATH` is used, and it is empty when `try_compile()` runs its build, so we will 
get errors during compiler checks done during CMake configure step. Fortunately, CMake provides a way to fix it.
Just before the call to `include(... arm_gnu_toolchain_utils.cmake)` we need to explicitly tell 
`ARM_GNU_TOOLCHAIN_PATH` to be preserved during `try_compile()` invocation.

```
list(APPEND CMAKE_TRY_COMPILE_PLATFORM_VARIABLES ARM_GNU_TOOLCHAIN_PATH)
```

This will make `#include` to standard libraries be resolved. 

Let's get to the linker errors.

### The standard C libraries, standard C++ libraries and the compiler runtime

Getting back to the `--sysroot` flag: CMake creates the linker command more or less like that - let's assume C++ for 
simplicity:

```
${CMAKE_CXX_COMPILER}                            \
    ${CMAKE_CXX_FLAGS}                           \
    ${CMAKE_EXE_LINKER_FLAGS_INIT}               \
    <per target lib*.a, *.o and *.obj files> 
```

There is no way to prevent `--sysroot` to appear in the linker command. Why we don't want to have `--sysroot` in 
the linker command? Because it will pull `path/to/arm_gnu_toolchain/arm-none-eabi/lib` path, where generic standard
libraries are located and they are not fine-tuned for our architecture.

Ok, but we could use `--sysroot` along with `-nostdlib`, and put the `-lc -lm ...` flags manually to the linker command,
e.g. using `CMAKE_EXE_LINKER_FLAGS_INIT`. Well, yes, but 
this will make overriding standard library symbols impossible. Consider having to override `printf` or `malloc`.
If we create a custom static library `libcustom_printf.a` and then we link it in such a way:

```
${CMAKE_CXX_COMPILER}                                                        \
    ${CMAKE_CXX_FLAGS}                                                       \
    -nostdlib                                                                \
    -lc -lm                                                                  \
    <some other linker flags from CMAKE_EXE_LINKER_FLAGS_INIT>               \
    -lcustom_printf                                                          \
    <other per target lib*.a, *.o and *.obj files> 
```

it will result in _multiple definitions error, for symbol printf_. The reason is that, the linker driver treats `libc.a`
and `libcustom_printf.a` as being on the same abstraction level, being user-specified static libraries. In such case,
there are two libraries with the same symbol, which is the `printf` symbol. If we force the linker driver to treat 
`libc.a` (and friends), to be a special library, a standard library, then it will know that it is acceptable to 
redefine them by supplying custom version of them. Actually, the standard libraries are used at the end of the 
linking, to pull unresolved symbols in all the object files of the program.

Now we know that we can't use `-nostdlib` and `--sysroot` flags. Unfortunately, trying to compile simple C++ program
we get bunch of undefined references error. Let's tackle it step by step.

1. _unable to find library -lc -lm_

Once again, `arm_gnu_toolchain_utils.cmake` to the rescue! The function `ArmGnu_GetStandardLibrariesDirectory` will
retrieve the path to `libc.a` and `libm.a`. We can make use of it in our toolchain file.

```
ArmGnu_GetStandardLibrariesDirectory(${basic_architecture_flags} standard_libraries_dir)
set(CMAKE_EXE_LINKER_FLAGS_INIT "-L${standard_libraries_dir}")
```

`CMAKE_EXE_LINKER_FLAGS_INIT` is used to create the linking command.

This will make the linker error related to `-lc lm` disappear.

2. _unable to find library -lc++ -lc++abi_

`libc++` and `libc++abi` are part of LLVM Project. Naturally, clang wants to pull the standard library which he knows.
`libstdc++` is the standard C++ library supplied by the ARM GNU GCC Toolchain, so we have to force `clang` to use it.
The `--stdlib=libstdc++` help us to fix it. We put it to the toolchain file:

```
set(CMAKE_EXE_LINKER_FLAGS_INIT "-L${standard_libraries_dir} --stdlib=libstdc++")
```

3. _unable to find library -lclang_rt.builtins-arm_

The same rule applies as for the `libc++` and `libc++abi` to the compiler runtime builtins. `clang` will try to pull
the compiler runtime from `clang_rt` library, but we use `libgcc` instead. We need to announce that to the compiler
with the `--rtlib` flag:

set(CMAKE_EXE_LINKER_FLAGS_INIT "-L${standard_libraries_dir} --stdlib=libstdc++ --rtlib=libgcc")

TODO:
A. Explain here -lgcc will not be found, so we use ArmGnu_Get... function to retrieve it.
B. CMAKE_EXE_LINKER_FLAGS_INIT gets messy so let's create a nice variable to split the flags across multiple lines.
C. Point 4. unable to find libunwind. Explain behavior, that clang doesn't know that libgcc contains unwind symbols.
D. Explain dummy libunwind creation.
E. Go by each error and reproduce it within the *Template project to see what errors will happen, and resolve them
within this blog post.
F. Explain the `.got` section in the disassembly and how to fix it, and what does it mean. 
H. Why gc-sections flag.
