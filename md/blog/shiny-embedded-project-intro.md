---
title: Shiny Embedded Project - Introduction
subtitle: Introducing best practices into an Embedded Project and having plenty of time.
published: false
datePublished: 1589064522569
author: Kacper Kowalski
tags:
  - Embedded
  - OO
  - ObjectOriented
  - C++
  - CMake
  - CleanCode
authorPhoto: /img/profile.jpg
bannerPhoto: /img/brook.jpg
thumbnailPhoto: /img/brook.jpg
canonicalUrl: https://jungles.emb.dev/blog/shiny-embedded-project-intro
---

I am going to create the Shiny Embedded Project everybody wants to have, but anyone having time to create it. Let me
introduce the idea, but firstly I will explain my background and the rationale behind the concept.

---

In my work experience I have been creating firmware for consumer electronics. The tech stack was more or less the same: 
Cortex M0/M3/M4 CPU, RTOS, C/C++, Make or CMake. 

I have always had the feeling that there is something wrong with the firmware development. The proud field standing 
at the crossroads between hardware and software. The field which doesn't really know which way to choose 
("spare that few more bytes or make the code more readable").

![Dramatic Crossroads - Firmware Developer - meme](/img/dramatic_crossroads_fw_dev_meme.png)

Embedded community does not provide many comprehensive sources of knowledge, or projects that adopt Clean Code rules and 
Object Oriented patterns. There are multiple guides that explain these aspects separately, in a scattered fashion, but
there is a lack of good examples implementing the guidelines on something real.

Have you ever experienced those scenarios:
* choosing old technologies for the sake of optimization,
* omitting writing unit tests, because of waste of time,
* dogmatism focused around virtual functions,
* favoring error codes over exceptions,
* unit tests written years ago, that nobody even knows how come they pass?, ...

But let's keep the drama on the side.

The project is called **Aura** and it's yet another weather station. It is a project I rewrite fourth, or fifth
time. Now I am quite confident with the stack and tools I am going to use. I hope that, if next time I rewrote the
project, I would not use the very same sentence like the previous one with the word "REALLY" blended into it. Darn! 
I hope that there will be no next time!

My key focus is to create a project with no technical debt and no compromises. I will use CI/CD, test rigs, static
code analysis, build and deployment automation; adopt Clean Code and Object Oriented patterns; write unit tests of
logic and driver tests run on the target device. In brief, everything you want to have in your project, but never
have the opportunity to implement it. I know: this is quite an objective, but if my motivation drops after some time,
hopefully some guides, providing help to the community, would have been created by the time. 

I would like not to say that my solutions are wünderbar and this is an act deriving from pride. The other motivation
is to confront the concepts with criticism, open it for improvement, fine tune it. Moreover, let's face the dogmatism
and supply counter-arguments with proofs, or the opposite - proofs that turn dogmatism into scepticism with strong
grounds. Of course, there is more to that: I wanna have fun incorporating "modern" ideas to the embedded development
field!

> See the first blog posts that boils down the requirements and the hardware used.
