
Fokus pada plugin workspace/mirza-marketing/plugins/telegram

Saat ini kita punya slash-commands `/status` yang outputnya semacam :

```
Context
○○○○○○○○○○ 4%
38.8k / 1M tokens

Rate Limit 5h
●○○○○○○○○○ 10%
reset reset just now

Rate Limit 7d
○○○○○○○○○○ 3%
reset 6d 9h

Opus 4.8 (1M context)
Session: bot-05 (341171c9)
CWD: …/workspace/bot-05
Cost: $0.35
Thinking: on
Effort: high
Fast: off

Plugin: telegram
v0.0.25-mirza.0

Plugin: pty-controller
v0.0.23

Wrapper: mirza-cc
v0.0.1

Last update: 10:25 WIB
(6h 55m ago)
```

Saya ingin kamu :
- introduce slash command baru yaitu : `/version` yang akan menampilkan 
  ```
  Plugin: telegram
  v0.0.25-mirza.0

  Plugin: pty-controller
  v0.0.23

  Wrapper: mirza-cc
  v0.0.1

  Plugin: agent-bus
  v0.0.3
  ```
  termasuk didalamnya penambahan agent-bus plugin version. Selanjutnya `/status` tidak menampilkan version dari plugin dan wrapper lagi.

- ubah `/status` menjadi `/context`

saya ingin kamu memperbaiki bagian ini :

```
Rate Limit 5h
●○○○○○○○○○ 10%
reset reset just now
```

kenapa ada "reset reset just now" ? duplicate "reset" words?

tolong bantu cek, apakah bagian version plugin itu hardcoded atau tidak. saya tidak ingin di hardcoded.

