# XR Boids

Virtual reality (VR) is becoming more widespread, and as such it offers an opportunity to present previous work in a way that demonstrates how brilliant it is. This includes data visualisation, gaming or education. Here we've added immersion and interactivity to boids, an 80s artificial live program.

## Boids

Boids were introduced by Craig Reynolds in [Flocks, Herds, and Schools: A Distributed Behavioral Model](https://graphics.stanford.edu/courses/cs448-01-spring/papers/reynolds.pdf), a paper describing computer-generated simulations of flocks of birds, or schools of fish. By programming a simplified model of the individual behaviour of an artificial bird (called boid), Reynolds was able to produce realistic renditions of whole flocks composed of dozens of boids.

[orignal paper screenshot]

Because boids produced realistic animations of flocks from a very simple behaviour model, Reynolds's paper is considered a milestone in the field of artificial life, but has also been influencial in the development of other CGI techniques like particle systems and crowd animation. Dozens of implementations and variations of the original code can be found online and attest how innovative and seminal the original idea was.

## VR

VR is an even older concept which is slowly becoming accessible thanks to the recent release of dedicated and self-contained devices such as Google's Cardboard, or the Oculus Quest (and a few more expected). With this new hardware comes a new market of games and applications, similar to phone apps or console games.

As is often the case, open and web-based standards follow proprietary formats and APIs for developing applications. In this case W3C's WebXR is becoming the standard for developing open immersive web applications, such as this one. WebXR is the new name the more obvious WebVR as it now integrates the capability to create augmented reality applications.


## Combining boids and VR

It's not difficult to imagine the improvements that an immersive experience can bring to the original boids program. While [Reynolds's original animations](https://www.youtube.com/watch?v=86iQiV3-3IA) are still very impressive to watch, we can now bring many of the benefits of VR:

[screenshot of original video] [screenshot of new video]

- immersion: being in the middle of dozens of boids swirling around is even more stunning than watching them on a standard screen.
- real-time: the original program took 95 seconds to compute a single frame (with 80 boids). Our demo animates 1024 boids at 30 frames per second.
- interactivity: with increased rendering speed it becomes possible to let the user interactively influence the flock. In this demo the user can move the VR controllers around in order to direct the movement and shape of the flock.
- realistic: fast graphics also make it possible to create boids that look more like birds (or fishes), for instance by giving them animated wings.


## Next

Reynold's paper lists possible improvements to the original algorithm, for instance by including the effect of gravity or creating a better model of each boid's senses. Computing the movement of boids in the GPU (see below) gives us the possibility to improve the original algorithms to something more realistic without degrading performance. The article also mentions adding external factors controlling the movement of birds is also mentioned: for instance obstacles, or the presence of predators disrupting the flock.

Many of those have been included on subsequent implementations, and we could add many of them to this demo. We've also considered more improvements such as:

- audio: simulating the sound that a flock makes as it swirls around the viewer would add to the realism and the sense of immersion
- more interactivity: controlling multiple flocks
- augmented reality: superimposing boids over the viewer's real-life environment, giving the illusion that the virtual flock is flying inside a real environment, avoiding obstacles.
- social/gaming: boid formations controlled by multiple viewers, choreography competitions, etc.

---

## Technical details

We started by taking a javascript implementation of the original algorithm [ref?] and integrated it in a VR enfironment using A-frame [screenshot+video of animation]. We then moved on to zz85's implementation (as found in Three.js), which computes the movement of boids using GPGPUs (general-purpose GPUs). This allowed us to increase to multiply the number of boids by 5 with no performance impact.

The way the flock is controlled by the user is by having each handset define a point in VR space which the boids will be attracted to (adding an extra influencing force on top of the three simulated by the original algorithm). If multiple controllers are used, each boid will move toward the nearest one.

A downside of using a GPGPU to compute the flocking algorithm is that the position and velocity of each boids is no longer available to the JS code. This makes it very difficult to create audio since calculating the volume and position of sound in VR space would need to be computed as a function of the position of each boid, only available in the GPU.
