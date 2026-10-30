VAR trust = 0

mira: You made it. The <color=primary>last train</color> leaves in five minutes.
mira: Can I count on you?
* [Yes]
    ~ trust = trust + 1
    mira: Then follow me. <wave>Quickly.</wave>
* [Not yet]
    mira: Fine. I will wait<pause=400>... for a while.
- Trust is now {trust}. #bg: platform
mira: The end. Run the example again to choose differently.
-> END
