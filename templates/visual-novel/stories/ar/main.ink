// مطر النيون، بالعربية. البنية نفسها: العقد والخيارات والوسوم كما في النسخة الإنجليزية.
VAR player = "Aoi"
VAR trust = 0
VAR saw_rooftop = false

-> street

=== street ===
# bg: street
# music: theme
نيون الحيّ القديم يطنّ تحت المطر.
mira: ها أنت ذا يا <color=primary>{player}</color>. # portrait: mira happy left # voice: mira_01
mira: لم أكن متأكدة أنك ستأتي. # expression: neutral
ren: بالطبع <b>جئنا</b>. # portrait: ren neutral right
mira: إذن اسمع<pause=400>... <wave>المدينة تغنّي الليلة.</wave> # expression: happy
* [اتبع ميرا إلى السطح]
  ~ trust = trust + 1
  ~ saw_rooftop = true
  -> rooftop
* [ابقَ مع رين]
  ren: قرار حكيم. الأسطح لمن لديهم أجنحة. # expression: smile
  -> night
* {trust > 2} [أخبرهما بالحقيقة]
  -> night

=== rooftop ===
# transition: ink
# bg: rooftop
# hide: ren
mira: انظر. اضغط <input=confirm> عندما تكون مستعدًا. # portrait: mira surprised center
شيء ما يومض فوق الأفق. # fx: glitch # sfx: chime
mira: <shake>هل رأيت ذلك؟</shake> # expression: worried # unlock: rooftop
-> night

=== night ===
# transition: iris
# bg: night
# clear
{ saw_rooftop:
  mira: رأينا الضوء نفسه. هذا يجعلنا شريكين. # portrait: mira happy center
- else:
  ren: ليلة هادئة. هادئة أكثر من اللازم. # portrait: ren neutral center
}
<speed=0.5>توقّف المطر.</speed> # unlock: night
-> END
