# The Wall - Playable Broadcast Prototype

Vertical slice locale del progetto: muro fisico 2D, round del format, quiz, bank, contratto finale, import/export JSON e replay ledger con seed.

## Avvio

```bash
cd wall-show-prototype
npm run serve
```

Se non hai `npm` nel path, usa direttamente:

```bash
cd wall-show-prototype
python3 -m http.server 5173
```

Apri:

```text
http://localhost:5173
```

## Test

```bash
cd wall-show-prototype
npm test
```

Oppure:

```bash
cd wall-show-prototype
node --test tests/*.test.js
```

## Cosa e gia implementato

- Muro fisico a 7 drop zone e 15 slot.
- Palline verdi/rosse con gravita, collisioni su pioli, rail e slot detector.
- Seed deterministico per ogni pallina e ledger esportabile a schermo.
- Tutte le domande sono a 4 opzioni.
- Free Fall con 5 domande, scelta manuale di 1/2/3/7 palline e drop zone configurabili.
- Round 2 con apertura green SuperDrop, Double/Triple/Wall-to-Wall, drop zone configurabili e chiusura red SuperDrop.
- Round 3 con apertura green, domande a 4 opzioni, contratto e red drop finale.
- Bank con floor a zero.
- Contratto: Free Fall bank + bonus per risposte corrette nei round di isolamento.
- Import/export del database domande in JSON.
- UI broadcast con bank, slot values, cue camera, pannelli palco/operatore.
- Pannello conduttore con foto locale di Gerry Scotti.

## Dati configurabili

- `data/ruleset.json`: premio slot, round, drop zone, bonus contratto.
- `data/questions.json`: database domande.

## Porting UE5

Questo prototipo mappa direttamente su:

- `WallGameSession` -> `AGameMode` + `UWallRoundStateMachine`
- `WallPhysics` -> `AWallBoard` + `AWallBall` con Chaos
- `WallRenderer` -> mesh/LED materials/Niagara
- `WallUi` -> UMG/Slate widgets
- `ruleset.json` -> `UWallRulesetAsset`
- `questions.json` -> DataTable/SQLite/FastAPI backend

Il prossimo passo produttivo e creare il progetto Unreal e replicare questi moduli in C++/Blueprint mantenendo lo stesso contratto dati.

## Crediti asset

- `assets/gerry-scotti-2010.jpg`: foto di Gerry Scotti da Wikimedia Commons, autore Xina.cappa, licenza CC BY-SA 4.0. Fonte: <https://commons.wikimedia.org/wiki/File:Gerry_Scotti_2010.jpg>
