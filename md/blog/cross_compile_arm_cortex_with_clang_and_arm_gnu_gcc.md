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
* An ARM Cortex M MCU - STM32L432KC is used as a base.
* LLVM+Clang 14.0.0 - the compiler and other tools.
* ARM GNU GCC Toolchain 10.3-2021.10 - libc, compiler runtime and friends.

---

## TLDR

The main post contains dismembered pieces of CMake code, to keep the flow of explanation. I have created
a template which allows you to use the toolchain file and the utilities without getting into the details.
The template is located [here](https://github.com/KKoovalsky/CrossCompileArmCortexMWithCMakeAndClangAndArmGnuToolchainLibs).
Make sure to read the main page of the repository, though. The template needs customization.

> _Note:_   
> In the meantime of writing this blog post, and preparing code for it, 
> [LLVM Embedded Toolchain for ARM](https://github.com/ARM-software/LLVM-embedded-toolchain-for-Arm) was released.
> It doesn't support exceptions though, but this guide targets building with exception support. If you don't need
> exceptions I still recommend reading the post, as it presents how one can use CMake to automate toolchain setup, and
> device executable creation.

## The layout

To make our project well-structured, we should group files by its purpose. Having that in mind, all the guidelines
here will assume that the main `CMakeLists.txt` is put under the project root directory, and all the helper
CMake scripts are put under `<project root dir>/cmake`.

## The CMake Toolchain file

The entry point for any cross-compilation with CMake is the CMake Toolchain file, so let's blindly create a basic 
one, with name `clang_with_arm_gnu_libs_device_toolchain.cmake`:

```cmake
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

This is a bit off-topic, but quite a necessary issue - the dependencies. We could provide the `LLVM_TOOLCHAIN_PATH`
in two ways:

* Download it "by hand" and call CMake with `LLVM_TOOLCHAIN_PATH` set to the downloaded path:

```bash
# Download the LLVM+Clang toolchain under path: path/to/llvm+clang
cmake -DLLVM_TOOLCHAIN_PATH=path/to/llvm+clang path/to/source/dir
```

* Download it automatically and set the `LLVM_TOOLCHAIN_PATH` from the top-level CMake file, using `FetchContent` 
module.

I prefer much more the second approach. Let me explain why.

## Downloading the toolchain automatically

At the stage of invoking the toolchain file during the CMake configure step, we need the `LLVM_TOOLCHAIN_PATH` to be
already set. So, when does CMake load the toolchain file? Assuming that we have run CMake configure and generate step
like that:

```bash
mkdir build && cd build/
cmake -DCMAKE_TOOLCHAIN_FILE=../cmake/clang_with_arm_gnu_libs_device_toolchain.cmake ..
```

The toolchain file will be loaded before evaluation of the `project()` function. It means that we have quite a space
where we could prepare our project for the invocation of the toolchain file. What's cool is that `FetchContent` module
works even before the evaluation of `project()`, so we can make use of it to download the LLVM toolchain.

Let's create a `dependencies.cmake` file with a function like that:

```cmake
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

```cmake
# Append our 'cmake/' directory to the CMAKE_MODULE_PATH, so that it will be easier to call 'include(MODULE)'.
list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_LIST_DIR}/cmake)
include(dependencies)
ProvideLlvm()
```

To make the things even easier, let's set the default `CMAKE_TOOLCHAIN_FILE`

```cmake
set(CMAKE_TOOLCHAIN_FILE ${CMAKE_CURRENT_LIST_DIR}/cmake/clang_with_arm_gnu_libs_device_toolchain.cmake CACHE PATH
    "Path to the CMake's toolchain file")

project(YourProjectName LANGUAGES CXX C ASM)
```

After this is done, we can invoke the CMake configure and generate step, as simple as that:

```bash
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
it may be costly, since the LLVM Toolchain is quite heavy. One can provide a local installation of the LLVM+Clang
by invoking CMake with `-DFETCHCONTENT_SOURCE_DIR_LLVM=path/to/local/llvm+clang` with the first run. The same can
be done for the ARM GNU GCC toolchain. See 
[its documentation](https://cmake.org/cmake/help/latest/module/FetchContent.html#variable:FETCHCONTENT_SOURCE_DIR_%3CuppercaseName%3E)
for more details.

It looks tempting to call the `ProvideLlvm()` from the toolchain file, but it is not a good approach, because
each time `try_compile()` is called, the toolchain file is re-evaluated. `try_compile()` performs a build on the side
so the dependencies will not be cached, thus `FetchContent` will not be prevented from redownloading the dependencies.
Don't do that!

## Bringing the compiler flags

You might have already noticed that there is the major part still missing. The compiler flags. Let's append them
to our toolchain file:

```cmake
# Targeting ARM Cortex M4 with FPU support (STM32L432KC).
set(basic_architecture_flags 
    "-mthumb -mcpu=cortex-m4 -mfloat-abi=hard -mfpu=fpv4-sp-d16")

set(basic_flags "${basic_architecture_flags} -fdata-sections -ffunction-sections")
```

Tweak the `basic_architecture_flags` for your architecture. What you need to find out is the CPU architecture and the
floating point unit, if any. If no floating point unit is supported on your microcontroller, then use `-mfloat-abi=soft`
and drop the `-mfpu` flag.

We need now to set the variable which CMake expects to be set within the toolchain file:

```cmake
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

Cool! We have a basic toolchain file. Now, if you try to compile a basic C source file using `add_executable()` command,
it, obviously, will not work. You'll get a bunch of errors:

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
use of it. To do that, I have created an 
[utility file](https://github.com/KKoovalsky/CrossCompileArmCortexMWithCMakeAndClangAndArmGnuToolchainLibs/blob/main/cmake/arm_gnu_toolchain_utils.cmake)
which will retrieve proper paths for the specific architecture. The file contains four main CMake functions:

```cmake
ArmGnu_GetCSystemIncludeFlags(basic_architecture_flags result_out_var)
ArmGnu_GetCxxSystemIncludeFlags(basic_architecture_flags result_out_var)
ArmGnu_GetStandardLibrariesDirectory(basic_architecture_flags result_out_var)
ArmGnu_GetCompilerRuntimeLibrariesDirectory(basic_architecture_flags result_out_var)
```

Which expect the basic architecture flags (the same as set with the `${basic_architecture_flags}` variable) as the 
first parameter. The second parameter is the variable that will be set as the result, AKA returned value.

But before I get into the details, we need to pull the proper ARM GNU GCC Toolchain to the project. I will do it the 
same way as for the LLVM Toolchain. We create a function, which will download it for us, and set a CACHE variable, with
the source directory.

```cmake
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

```cmake
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
What's necessary for us are the standard include paths. This is how the dump goes, pretty much:

```bash
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

```cmake
include(${CMAKE_CURRENT_LIST_DIR}/arm_gnu_toolchain_utils.cmake)
ArmGnu_GetCSystemIncludeFlags(${basic_architecture_flags} c_system_includes)
ArmGnu_GetCxxSystemIncludeFlags(${basic_architecture_flags} cxx_system_includes)
```

And then we change the `*_INIT` flags:

```cmake
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

```cmake
list(APPEND CMAKE_TRY_COMPILE_PLATFORM_VARIABLES ARM_GNU_TOOLCHAIN_PATH)
```

This will make `#include` to standard libraries be resolved. 

Let's get to the linker errors.

### The standard C libraries, standard C++ libraries and the compiler runtime

Getting back to the `--sysroot` flag: CMake creates the linker command more or less like that - let's assume C++ for 
simplicity:

```bash
${CMAKE_CXX_COMPILER}                            \
    ${CMAKE_CXX_FLAGS}                           \
    ${CMAKE_EXE_LINKER_FLAGS_INIT}               \
    <per target lib*.a, *.o and *.obj files> 
```

There is no way to prevent `--sysroot` to appear in the linker command. Why we don't want to have `--sysroot` in 
the linker command? Because it will pull `path/to/arm_gnu_toolchain/arm-none-eabi/lib` path, where generic standard
libraries are located, and they are not fine-tuned for our architecture.

OK, but we could use `--sysroot` along with `-nostdlib`, and put the `-lc -lm ...` flags manually to the linker command,
e.g. using `CMAKE_EXE_LINKER_FLAGS_INIT`. Well, yes, but 
this will make overriding standard library symbols impossible. Consider having to override `printf` or `malloc`.
If we create a custom static library `libcustom_printf.a` and then we link it in such a way:

```bash
${CMAKE_CXX_COMPILER}                                                        \
    ${CMAKE_CXX_FLAGS}                                                       \
    -nostdlib                                                                \
    -lc -lm                                                                  \
    <some other linker flags from CMAKE_EXE_LINKER_FLAGS_INIT>               \
    -lcustom_printf                                                          \
    <other per target lib*.a, *.o and *.obj files> 
```

It will result in _multiple definitions error, for symbol printf_. The reason is that, the linker driver treats `libc.a`
and `libcustom_printf.a` as being on the same abstraction level, being user-specified static libraries. In such case,
there are two libraries with the same symbol, which is the `printf` symbol. If we force the linker driver to treat 
`libc.a` (and friends), to be a special library, a standard library, then it will know that it is acceptable to 
redefine them by supplying custom version of them. Actually, the standard libraries are used at the end of the 
linking, to pull unresolved symbols in all the object files of the program.

Now we know that we can't use `-nostdlib` and `--sysroot` flags. Unfortunately, trying to compile simple C++ program
we get a bunch of undefined references error. Let's tackle it step by step.

### The nasty linker errors

➡️  _unable to find library -lc -lm_

Once again, `arm_gnu_toolchain_utils.cmake` to the rescue! The function `ArmGnu_GetStandardLibrariesDirectory` will
retrieve the path to `libc.a` and `libm.a`. We can make use of it in our toolchain file.

```cmake
ArmGnu_GetStandardLibrariesDirectory(${basic_architecture_flags} standard_libraries_dir)
set(CMAKE_EXE_LINKER_FLAGS_INIT "-L${standard_libraries_dir}")
```

`CMAKE_EXE_LINKER_FLAGS_INIT` is used to create the linking command.

This will make the linker error related to `-lc lm` disappear.

---

➡️  _unable to find library -lc++ -lc++abi_

`libc++` and `libc++abi` are part of LLVM Project. Naturally, clang wants to pull the standard library he knows.
`libstdc++` is the standard C++ library supplied by the ARM GNU GCC Toolchain, so we have to force `clang` to use it.
The `--stdlib=libstdc++` help us to fix it. We put it to the toolchain file:

```cmake
set(CMAKE_EXE_LINKER_FLAGS_INIT "-L${standard_libraries_dir} --stdlib=libstdc++")
```

---

➡️  _unable to find library -lclang\_rt.builtins-arm_

The same rule applies as for the `libc++` and `libc++abi` to the compiler runtime builtins. `clang` will try to pull
the compiler runtime from `clang_rt` library, but we use `libgcc` instead. We need to announce that to the compiler
with the `--rtlib` flag:

```cmake
set(CMAKE_EXE_LINKER_FLAGS_INIT "-L${standard_libraries_dir} --stdlib=libstdc++ --rtlib=libgcc")
```

After this is done, the linker raises `-lgcc` not found error. In the above CMake code line, there is no path to
`libgcc.a` specified. We must supply it. The `ArmGnu_GetCompilerRuntimeLibrariesDirectory` helps us retrieve it:

```cmake
ArmGnu_GetCompilerRuntimeLibrariesDirectory(${basic_architecture_flags} compiler_runtime_libraries_dir)
set(CMAKE_EXE_LINKER_FLAGS_INIT 
    "-L${standard_libraries_dir} -L${compiler_runtime_libraries_dir} --stdlib=libstdc++ --rtlib=libgcc")
```

> Small note on the side:  
> `arm-none-eabi-gcc` features `-print-file-name` and `-print-libgcc-file-name` options. When called with proper
> architecture flags, we can retrieve paths to `libc.a` and `libgcc.a` for our CPU. This is exactly what
> `ArmGnu_GetCompilerRuntimeLibrariesDirectory()` and `ArmGnu_GetStandardLibrariesDirectory()` functions do.

---

_A bit off-topic now._ There will be more flags introduced to the `CMAKE_EXE_LINKER_FLAGS_INIT` variable. Let's create
a prettier variable, where all the flags will be put:

```cmake
string(CONCAT exe_linker_flags
    " --rtlib=libgcc"
    " --stdlib=libstdc++"
    " -L${standard_libraries_dir}"
    " -L${compiler_runtime_libraries_dir}"
)
set(CMAKE_EXE_LINKER_FLAGS_INIT "${exe_linker_flags}")
```

Note the space at the beginning of each string. The flags must be concatenated to a space-separated string.

In the following bullets we will append the flags to the `exe_linker_flags` variable.

---

➡️  _unable to find library -lunwind_

Although `libgcc.a` does not only contain the compiler runtime, but also the unwind library symbols, `clang` still 
wants to link `libunwind.a`. But if we are certain, that all the symbols are satisfied, we can provide a dummy
`libunwind.a` library only to satisfy the linker flag. `clang` supports `--unwindlib=[libgcc|libunwind|none]` flag
which, unfortunately, doesn't seem to work for the targeted architecture. We can easily work around it, by writing
a function, which creates an empty `linbunwind.a` and returns a path to it. In the `llvm_toolchain_utils.cmake`:

```cmake
function(Llvm_GetDummyLibunwindDirectory result_out_var)
    set(libunwind_dir ${CMAKE_CURRENT_BINARY_DIR}/dummy_libunwind)
    # To ensure portability use CMake command mode.
    execute_process(COMMAND ${CMAKE_COMMAND} -E make_directory ${libunwind_dir})
    execute_process(COMMAND ${CMAKE_COMMAND} -E touch ${libunwind_dir}/libunwind.a)
    set(${result_out_var} ${libunwind_dir} PARENT_SCOPE)
endfunction()
```

We must call it in the toolchain file:

```cmake
include(${CMAKE_CURRENT_LIST_DIR}/llvm_toolchain_utils.cmake)
Llvm_GetDummyLibunwindDirectory(libunwind_dir)
```

Finally, we append the linker flag to `exe_linker_flags`:

```cmake
    " -L${libunwind_dir}"
```

Done! The executable should compile at this stage. The `exe_linker_flags` at this point:

```cmake
string(CONCAT exe_linker_flags
    " --rtlib=libgcc"
    " --stdlib=libstdc++"
    " -L${standard_libraries_dir}"
    " -L${compiler_runtime_libraries_dir}"
    " -L${libunwind_dir}"
)
```

Sadly, it is not the end yet. We are able to compile a binary, but there are still a few things missing.

## A "flashable" binary

When compiling a basic executable, the linker should have generated such a warning:

> ld.lld: warning: cannot find entry symbol _start; not setting start address

The reason is that we are missing a linker script. Normally, I use STM32CubeMX to generate the linker script for me.
This time I will also use it, but before that, let me introduce a concept of a device-targeted executable. 

Frequently, when an Embedded Ecosystem is considered (e.g. Zephyr, PlatformIO, ...), the idea of creating multiple
executables within a single project is neglected. One of the major objectives for the environment we currently create
is to have such an opportunity. Let's make it convenient by creating a `device_executable.cmake` file, with a 
function `AddDeviceExecutable()` that will have the same interface as the built-in `add_executable()`. The function
will be responsible for creating a proper "flashable" executable. 

> _Note:_   
> At this stage the guide becomes not universal. Nonetheless, the details differ just a bit and with the 
> [template](https://github.com/KKoovalsky/CrossCompileArmCortexMWithCMakeAndClangAndArmGnuToolchainLibs)
> you can adapt it to your case.

I use STM32 HAL library with source code generated by STM32CubeMX, thus the basic setup the `AddDeviceExecutable()`
must perform is:

- Force linker to use specific linker script.
- Include the startup code.
- Link symbols which are used by the startup code.

Adapt `AddDeviceExecutable()` to your case. What I do normally is I collect the HAL, LL library, CMSIS and the Cube
generated sources to a single static library, with all the include directories as 
`target_include_directories(... PUBLIC ...)`, and the necessary macro definitions 
`target_compile_definitions(... PUBLIC USE_HAL_DRIVER STM32L432xx ...)`. Then I link this static library to each
device executable. See a [ready-to-go implementation](https://github.com/KKoovalsky/AuraFW/blob/main/cmake/device_executable.cmake)
of the `AddDeviceExecutable()` function, and how is the 
[STM32CubeMX generated code](https://github.com/KKoovalsky/AuraFW/blob/main/src/device/cube/CMakeLists.txt)
collected.

See [the example implementation](https://github.com/KKoovalsky/CrossCompileArmCortexMWithCMakeAndClangAndArmGnuToolchainLibs/blob/main/cmake/device_executable.cmake).
The startup file is linked to the executable as an `OBJECT` library, what can cause confusion. The main reason is
that we want the startup file to be treated as a source file, being part of the executable target. This is done
to force proper linkage of the symbols within it, when experimenting with compiler flags. We could add the
startup file directly to the executable, without creating an `OBJECT` library, but that would lead to recompilation
of the startup file for each executable separately. We simply spare some time with that approach.

In the example mentioned, the basics: the linker script, startup code and dependencies for it, are located under 
the [demo subdirectory](https://github.com/KKoovalsky/CrossCompileArmCortexMWithCMakeAndClangAndArmGnuToolchainLibs/tree/main/demo).

Finally, one can call the function like so:

```cmake
AddDeviceExecutable(some_exec1 main.c source1.c source2.c)
AddDeviceExecutable(some_exec2 main.cpp source3.cpp source4.cpp)
```

### More linker errors

> _Note (which corresponds to the previous "Note"):_  
> This guide becomes (almost) universal again! You might not need all of the flags introduced with this subsection.
> The redundant flags can only affect the binary size by <100B.

Being able to create a "device" executable came at cost. We got more linker errors.

---

➡️  _undefined symbol: \_init_

This linker error comes from that my startup file calls `__libc_init_array`, which in turn calls the `_init` 
procedure. This is a leftover from a legacy scheme of linking global constructors and putting them into the `.init`
section. We can provide a dummy `_init()` function and link it similar way to the `libunwind.a`, but let's firstly
check out how does `arm-none-eabi-gcc` does that, since no such linker error is generated when using it.

When cross-compiling using `arm-none-eabi-g{cc,++}` with `-###` flag, one can notice that it links the final executable
more or less like that:

```bash
ld -o output_file crti.o crtbegin.o [custom libs and objects] -lgcc crtend.o crtn.o
```

Quickly iterating over the `crt*.o` objects using the `objdump -S` command, gives us an output that `crti.o` and 
`crtn.o` contain `_init`, `_fini` symbols, and `.init`, `.fini` sections. 

The place within the linker command, where GCC has put the custom objects and static libraries, is also not accidental. 
This is due to legacy reason, for collection of the `.init` and `.fini` sections - the global constructors/destructors.
In 2022+ we don't have to recreate the strict linking order - there is no need to put the custom libraries and objects
in the middle of the line. That would complicate cross-compiling. Since the `.init`/`.fini` sections are replaced
by _init_ and _fini_ arrays, it's sufficient that we keep the order of crtstuff, so this is what we will append to
`exe_linker_flags`:

```cmake
    " ${compiler_runtime_libraries_dir}/crti.o"
    " ${compiler_runtime_libraries_dir}/crtbegin.o"
    " ${compiler_runtime_libraries_dir}/crtend.o"
    " ${compiler_runtime_libraries_dir}/crtn.o"
```
---

➡️  undefined reference to `_open`, `_close`, `_stat`, `_sbrk`, ... more syscalls

For baremetal:

```cmake
    " -lnosys"
```

### Large final binary size

Initially, this can be solved with:

```cmake
    " -Wl,--gc-sections"
```

But that's not all. For a binary containing C++ object files where exceptions are used, the default 
`__terminate_handler` is quite heavy (pulls additional 60 kB in Release mode). We can override it by supplying
a custom one:

```cpp
#include <exception>

[[noreturn]] void terminate() noexcept
{
    while (true)
        ;
}

namespace __cxxabiv1
{
std::terminate_handler __terminate_handler = terminate;
}
```

It is empty, but you can fill the body of `terminate()` with any code you like. To link the custom terminate handler
to each device executable, we need to create a library with the handler, inside `device_executable.cmake`:

```cmake
# 1. Assumes that the script lies under <project_root>/cmake.
# 2. Assumes the custom terminate implementation to be put under <project_root>/src/device/custom_terminate.cpp
add_library(custom_terminate OBJECT 
    ${CMAKE_CURRENT_LIST_DIR}/../src/device/custom_terminate.cpp)
```

To ensure each executable uses the `custom_terminate.cpp`, we must insert this piece of code to the
`AddDeviceExecutable()` function:

```cmake
target_sources(${target_name} PRIVATE $<TARGET_OBJECTS:custom_terminate>)
```

`custom_terminate` is linked as an OBJECT library, to force the symbol precedence.

### Exceptions not working

Trying to run the simplest C++ code that throws, leads to surprising behaviour, that none of the exceptions will
be caught properly, and the code will crash.

Running `arm-none-eabi-objdump -s` on the binary results in seeing a `.got` section landed in the executable. 
It's related to stack unwinding and finding a proper `catch` handler, which is controlled with `R_ARM_TARGET2` 
relocation. Although the 
[Exception handling ABI for the ARM Architecture](https://github.com/ARM-software/abi-aa/blob/60a8eb8c55e999d74dac5e368fc9d7e36e38dda4/ehabi32/ehabi32.rst)
explicitly claims that ARM baremetal uses `R_ABS32` for `R_ARM_TARGET2`, linking with:

```cmake
    " -Wl,--target2=rel"
```

Makes the `.got` section disappear, and fixes exceptions to be caught properly.

The option for `R_ABS32` is `--target2=abs`, thus, this is the option which should be working, but it doesn't.
The `.got/.rel` scheme is used by 
Linux and BSD targets, not on the ARM baremetal targets. To read further about the `--target2` flag, see the
[GCC's ld ARM documentation](https://sourceware.org/binutils/docs/ld/ARM.html). 

## Finalizing 

After all the struggle, the final `exe_linker_flags` form is:

```cmake
string(CONCAT exe_linker_flags
    " --rtlib=libgcc"
    " --stdlib=libstdc++"
    " -L${standard_libraries_dir}"
    " -L${compiler_runtime_libraries_dir}"
    " -L${libunwind_dir}"
    " ${compiler_runtime_libraries_dir}/crti.o"
    " ${compiler_runtime_libraries_dir}/crtbegin.o"
    " ${compiler_runtime_libraries_dir}/crtend.o"
    " ${compiler_runtime_libraries_dir}/crtn.o"
    " -lnosys"
    " -Wl,--gc-sections"
    " -Wl,--target2=rel"
)
```

> _Note:_  
> Few of the flags, e.g. `--stdlib` are C++ specific, thus they are redundant when compiling pure C executable. 
> Because of that `clang` might generate warnings. If you don't like them, you can experiment supplying the linker
> flags with the `-Xlinker` option used within `CMAKE_<LANG>_FLAGS_INIT`.

Our toolchain file is complete!
