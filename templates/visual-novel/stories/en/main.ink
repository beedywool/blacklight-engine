// Neon Rain, English. The Japanese and Arabic stories keep the same knots, choices and tags, so a
// save (and a language switch) works in every language.
// Speaker ids (mira, ren) are translated in locales/<lang>.json under "speakers".
VAR player = "Aoi"
VAR trust = 0
VAR saw_rooftop = false

-> street

=== street ===
# bg: street
# music: theme
The neon of the old district hums in the rain.
mira: There you are, <color=primary>{player}</color>. # portrait: mira happy left # voice: mira_01
mira: I wasn't sure you would come. # expression: neutral
ren: Of course <b>we</b> came. # portrait: ren neutral right
mira: Then listen<pause=400>... <wave>the city is singing tonight.</wave> # expression: happy
* [Follow Mira to the rooftop]
  ~ trust = trust + 1
  ~ saw_rooftop = true
  -> rooftop
* [Stay with Ren]
  ren: Good call. Rooftops are for people with wings. # expression: smile
  -> night
* {trust > 2} [Tell them the truth]
  -> night

=== rooftop ===
# transition: ink
# bg: rooftop
# hide: ren
mira: Look. Press <input=confirm> when you are ready. # portrait: mira surprised center
Something flickers across the skyline. # fx: glitch # sfx: chime
mira: <shake>Did you see that?</shake> # expression: worried # unlock: rooftop
-> night

=== night ===
# transition: iris
# bg: night
# clear
{ saw_rooftop:
  mira: We saw the same light. That makes us accomplices. # portrait: mira happy center
- else:
  ren: Quiet night. Too quiet. # portrait: ren neutral center
}
<speed=0.5>The rain stops.</speed> # unlock: night
-> END
