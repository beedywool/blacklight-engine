// ネオン・レイン（日本語）。英語版と同じノット、選択肢、タグ構成。
VAR player = "Aoi"
VAR trust = 0
VAR saw_rooftop = false

-> street

=== street ===
# bg: street
# music: theme
古い街区のネオンが、雨の中で低くうなっている。
mira: 来てくれたんだね、<color=primary>{player}</color>。 # portrait: mira happy left # voice: mira_01
mira: 来ないかと思ってた。 # expression: neutral
ren: もちろん<b>僕たち</b>は来たさ。 # portrait: ren neutral right
mira: じゃあ聞いて<pause=400>……<wave>今夜、街が歌ってる。</wave> # expression: happy
* [ミラと屋上へ行く]
  ~ trust = trust + 1
  ~ saw_rooftop = true
  -> rooftop
* [レンと残る]
  ren: いい判断だ。屋上は翼のある人のためのものさ。 # expression: smile
  -> night
* {trust > 2} [本当のことを話す]
  -> night

=== rooftop ===
# transition: ink
# bg: rooftop
# hide: ren
mira: 見て。準備ができたら<input=confirm>を押して。 # portrait: mira surprised center
何かが、空の向こうで一瞬ちらついた。 # fx: glitch # sfx: chime
mira: <shake>今の、見た？</shake> # expression: worried # unlock: rooftop
-> night

=== night ===
# transition: iris
# bg: night
# clear
{ saw_rooftop:
  mira: 同じ光を見たね。これで私たちは共犯者だ。 # portrait: mira happy center
- else:
  ren: 静かな夜だ。静かすぎる。 # portrait: ren neutral center
}
<speed=0.5>雨がやんだ。</speed> # unlock: night
-> END
