# The Wall - Specifica di Produzione Tecnica

Documento per un team di sviluppo UE5/Unity, game physics, realtime VFX, UI broadcast e backend quiz.

> Nota legale: questa specifica assume una produzione autorizzata/licenziata del format, del marchio e della veste grafica. Per un prodotto commerciale non licenziato occorre sostituire naming, set design, prize logic proprietaria e asset riconoscibili.

## 1. Baseline Regolamento

### Fonti e baseline

Baseline consigliata: versione USA moderna, perche e la piu documentata e scalabile. Il sistema deve restare data-driven per varianti locali.

Fonti usate:

- NBC, pagina ufficiale del programma: <https://www.nbc.com/the-wall>
- NBC Insider, articoli ufficiali su meccaniche, cast e stagione: <https://www.nbc.com/nbc-insider>
- NBCUniversal Formats, scheda format internazionale: <https://www.nbcuniformats.com/>
- Wikipedia, riepilogo puntate/regole/valori slot: <https://en.wikipedia.org/wiki/The_Wall_(American_game_show)>
- Game Shows Wiki, dettaglio operativo dei round: <https://gameshows.fandom.com/wiki/The_Wall>
- Epic Games, fisica Chaos: <https://dev.epicgames.com/documentation/en-us/unreal-engine/physics-in-unreal-engine>
- Epic Games, Lumen/Niagara: <https://dev.epicgames.com/documentation/en-us/unreal-engine/>
- Unity Manual, physics/CCD: <https://docs.unity3d.com/Manual/>

### Concetto del format

Due concorrenti giocano contro un muro verticale a pioli. Le palline possono diventare:

- **Verdi**: aggiungono al bank il valore dello slot in cui atterrano.
- **Rosse**: sottraggono dal bank il valore dello slot in cui atterrano.
- **Bianche/neutre**: diventano verdi o rosse dopo la risposta.

Il bank non deve mai scendere sotto zero: si applica `max(0, bank - loss)`.

Il gioco alterna conoscenza, rischio e fortuna controllata: le risposte determinano il colore o la quantita delle palline, mentre il muro determina il valore economico.

### Round 1 - Free Fall

Obiettivo: costruire un bank iniziale rapido.

Regole baseline:

- Coppia sul palco, nessun isolamento.
- 5 domande con 2 opzioni.
- Per ogni domanda cadono 3 palline bianche simultanee, tipicamente da drop zone predefinite `1, 4, 7`.
- La coppia deve bloccare la risposta prima che la prima pallina raggiunga una slot.
- Risposta corretta: tutte le palline diventano verdi e sommano i valori.
- Risposta errata o mancata risposta: tutte le palline diventano rosse e sottraggono i valori.
- Se il bank finale e positivo, si accede al Round 2.
- Variante moderna: **Free Fall Plus**, una volta a puntata, consente di raddoppiare l'esito economico della domanda/serie configurata.

Implementazione:

```cpp
enum class EBallColor : uint8 { White, Green, Red };

int64 ApplyBallResult(int64 Bank, EBallColor Color, int64 SlotValue)
{
    if (Color == EBallColor::Green) return Bank + SlotValue;
    if (Color == EBallColor::Red)   return FMath::Max<int64>(0, Bank - SlotValue);
    return Bank;
}
```

### Round 2 - Isolation Round

Obiettivo: separare decisione e conoscenza.

Regole baseline moderna:

- Un concorrente resta sul palco e sceglie drop zone / opzioni di rischio.
- L'altro va in isolamento e risponde alle domande senza conoscere bank aggiornato, correttezza e cadute.
- Domande a 3 opzioni.
- Apertura moderna: **SuperDrop verde** con 7 palline, una per drop zone, prima delle domande.
- Domanda 1: 1 pallina.
- Domanda 2: possibilita **Double Up**: 2 palline invece di 1.
- Domanda 3: possibilita **Triple Up**: 3 palline, o variante **Wall-to-Wall**: 7 palline.
- Il colore delle palline dipende dalla risposta dell'isolato:
  - corretta: verde
  - errata: rossa
- Chiusura round: SuperDrop rosso equivalente alla sequenza verde iniziale, se il bank e sufficiente secondo ruleset; altrimenti bank azzerato.

Regola tecnica consigliata:

```cpp
bool ShouldRunClosingRedDrop(int64 Bank, int32 RedBallCount, int64 MinSlotValue)
{
    return Bank > RedBallCount * MinSlotValue;
}
```

### Round 3 - Final Round + Contract

Obiettivo: massima tensione narrativa.

Regole baseline:

- Il concorrente sul palco avvia il round con una sequenza di 4 palline verdi, scegliendo drop zone.
- 3 domande a 4 opzioni.
- Domanda 1: una pallina.
- Domanda 2: **Double Up**.
- Domanda 3: **Triple Up**.
- Dopo la terza domanda viene inviato all'isolato un **contratto**.
- L'isolato puo firmare o strappare il contratto.
- Valore contratto:
  - base garantita del Round 1
  - piu bonus fisso per ogni risposta corretta nei Round 2 e 3
  - nella versione US moderna il bonus documentato e configurabile come `$20,000` per risposta corretta
- Dopo la decisione, sul palco cadono 4 palline rosse nelle stesse drop zone/ordine delle 4 verdi iniziali.
- Finale:
  - contratto firmato: payout = valore contratto
  - contratto strappato: payout = bank finale del muro
- L'isolato non conosce il risultato fino alla reunion finale.

Formula:

```text
contract_value = round1_bank + correct_answers_round2_3 * contract_bonus
payout = signed_contract ? contract_value : wall_bank_after_final_reds
```

### Prize Table

Il muro ha 15 slot di valore e 7 drop zone. I valori cambiano per round e stagione; vanno sempre in asset configurabili.

Esempio di configurazione:

```json
{
  "rulesetId": "US_Modern_Configurable",
  "currency": "USD",
  "dropZones": 7,
  "slots": 15,
  "bankFloor": 0,
  "contractBonusPerCorrectAnswer": 20000,
  "rounds": {
    "freeFall": {
      "questions": 5,
      "choices": 2,
      "ballsPerQuestion": 3,
      "defaultDropZones": [1, 4, 7],
      "slotValues": [1, 1000, 1, 5000, 100, 10000, 1, 25000, 1, 50000, 100, 75000, 1, 100000, 1],
      "freeFallPlusEnabled": true
    },
    "round2": {
      "openingGreenSuperDrop": true,
      "questions": 3,
      "choices": 3,
      "questionBallCounts": [1, 2, 3],
      "wallToWallEnabled": true,
      "slotValues": [1, 5000, 100, 10000, 10, 25000, 1, 50000, 1, 75000, 10, 100000, 100, 150000, 1]
    },
    "round3": {
      "openingGreenBalls": 4,
      "questions": 3,
      "choices": 4,
      "questionBallCounts": [1, 2, 3],
      "slotValues": [1, 10000, 100, 20000, 10, 50000, 1, 100000, 1, 200000, 10, 300000, 100, 500000, 1]
    }
  }
}
```

Nota: i valori slot devono essere verificati con il broadcaster/licensor per la stagione/localizzazione esatta. In codice devono vivere in `UWallRulesetAsset`, non hardcoded.

## 2. Modalita Giocatore

### Modalita Doppio - Fedele TV

Ruoli:

- **Stage Player**: sceglie drop zone, Double/Triple, Wall-to-Wall, vive la tensione visuale.
- **Isolation Player**: risponde alle domande senza feedback economico.

Il sistema deve supportare:

- due input controller locali
- split fisico palco/isolamento in UI
- isolamento audio/visivo per multiplayer online
- delayed reveal finale

### Modalita Singolo

Modalita non originale, ma utile per videogame:

1. **Solo Authentic**: il giocatore alterna ruoli; quando e in isolamento, il sistema nasconde bank e cadute.
2. **Solo Stage + AI Partner**: AI risponde alle domande in base a difficolta/persona.
3. **Solo Quiz + Director**: giocatore risponde, il director suggerisce drop zones basate su rischio.

Scelta consigliata: **Solo Authentic**, perche preserva il linguaggio del format e richiede meno AI finta.

## 3. Muro Fisico Realistico

### Scala e layout

Target visivo: muro alto circa 4 piani, LED spettacolare, 7 ingressi, 15 slot finali.

Coordinate consigliate UE:

```text
1 Unreal Unit = 1 cm
WallHeight = 1220 cm
WallWidth  = 820 cm
BallRadius = 14-18 cm
PegRadius  = 4-6 cm
PegSpacingX = 42 cm
PegSpacingY = 34-38 cm
BoardPlaneThickness = 18 cm
PhysicsPlaneDepth = 36 cm
```

Collisione 2.5D:

- la pallina e una sfera 3D reale
- il movimento e confinato da due pannelli invisibili front/back
- i pioli sono capsule/cilindri con collisione semplice
- le pareti laterali hanno colliders smussati, non box duri

### Mesh e collisioni

Non usare collisione complessa su mesh artistica.

Struttura:

```text
AWallBoard
  - UStaticMeshComponent VisualBackplate
  - UInstancedStaticMeshComponent PegVisuals
  - UHierarchicalInstancedStaticMeshComponent LedCells
  - TArray<UCapsuleComponent*> PegColliders
  - TArray<UBoxComponent*> SlotTriggers
  - UBoxComponent FrontConstraint
  - UBoxComponent BackConstraint
  - UBoxComponent LeftRail / RightRail
```

Per performance:

- collider dei pioli come `UCapsuleComponent` statico
- visuali pioli con instancing
- slot detector come trigger separati
- ball count simultaneo tipico: 1-7, quindi Chaos regge bene con substepping

### Parametri fisici

Asset `UWallPhysicsProfile`:

```json
{
  "gravityScale": 1.0,
  "physicsHz": 240,
  "renderHz": 60,
  "ballMassKg": 0.42,
  "ballRadiusCm": 16,
  "linearDamping": 0.02,
  "angularDamping": 0.06,
  "ballRestitution": 0.58,
  "pegRestitution": 0.52,
  "ballFriction": 0.18,
  "pegFriction": 0.22,
  "ccdEnabled": true,
  "maxDepenetrationVelocity": 350,
  "sleepDisabled": true
}
```

Setup UE:

- Chaos Physics
- substepping attivo a 120-240 Hz
- CCD attivo sulle palline
- physics material separati per ball, peg, side rail, slot ramp
- no teleport dopo spawn, solo impulsi iniziali minimi

### Pseudo-random controllato

Obiettivo: sembra una macchina fisica reale, ma e riproducibile, auditabile e registicamente gestibile.

Principio:

- ogni drop genera un `DropSeed`
- il seed determina micro-jitter iniziale, spin, rumore di contatto e lievi vibrazioni del launcher
- l'esito non deve essere forzato durante la caduta
- per modalita premio reale: RNG non pilotato, log immutabile
- per modalita simulatore/TV interactive senza premio reale: possibile seed selection da una finestra statistica approvata dal director

Ledger:

```json
{
  "matchId": "2026-05-23-show-001",
  "ballId": "R3-Q2-B1",
  "dropZone": 5,
  "seed": 1837742984,
  "initialOffsetCm": -0.42,
  "initialSpinRad": 0.31,
  "slotLanded": 12,
  "slotValue": 300000,
  "color": "GREEN",
  "simVersion": "wall-physics-1.4.0",
  "hash": "sha256:..."
}
```

Seed selection per entertainment mode:

```cpp
struct FSeedCandidate
{
    int32 Seed;
    int32 PredictedSlot;
    float ProbabilityWeight;
};

int32 ChooseSeedForDrop(
    const TArray<FSeedCandidate>& Candidates,
    const TArray<float>& TargetSlotDistribution,
    FRandomStream& DirectorRng)
{
    TArray<float> Weights;
    Weights.Reserve(Candidates.Num());

    for (const FSeedCandidate& C : Candidates)
    {
        const float Target = TargetSlotDistribution.IsValidIndex(C.PredictedSlot)
            ? TargetSlotDistribution[C.PredictedSlot]
            : 0.0f;

        // Weight by target distribution, but never zero out natural outcomes.
        Weights.Add(FMath::Max(0.02f, Target) * C.ProbabilityWeight);
    }

    return WeightedPick(Candidates, Weights, DirectorRng).Seed;
}
```

Importante: in modalita con premi veri, evitare rejection sampling e target distribution. Usare solo RNG auditato.

### Calibrazione probabilistica

Per ogni drop zone:

1. Simulare 50.000-250.000 cadute headless.
2. Salvare istogramma `P(slot | dropZone, physicsProfile, boardVersion)`.
3. Confrontare distribuzioni tra versioni.
4. Bloccare board/physics profile per stagione.
5. Eseguire smoke test prima di ogni build.

Formato:

```json
{
  "boardVersion": "Board_A_2026_01",
  "physicsProfile": "Broadcast_Default",
  "dropZoneProbabilities": {
    "1": [0.22, 0.18, 0.14, 0.11, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03, 0.02, 0.02, 0.01, 0.005, 0.005],
    "4": [0.02, 0.03, 0.04, 0.06, 0.08, 0.10, 0.13, 0.16, 0.13, 0.10, 0.08, 0.04, 0.02, 0.01, 0.005]
  }
}
```

## 4. Motore Consigliato

### Scelta primaria: Unreal Engine 5

Motivazione:

- Chaos Physics integrato e adatto a cadute cinematiche con CCD/substepping
- Lumen per illuminazione realtime broadcast
- Niagara per VFX LED, sparks, confetti, shockwave, trail
- Sequencer/Camera Rig per movimenti televisivi
- UMG/Slate per UI operator e broadcast
- nDisplay/DMX se il prodotto entra in scenografie LED reali

### Unity HDRP come alternativa

Vantaggi:

- toolchain piu rapida per prototipi
- ottimo per build Web/desktop leggere
- C# veloce per backend/gameplay iteration

Limiti:

- per il look AAA broadcast, Unreal riduce il lavoro su lighting, cinematic camera e virtual production
- fisica PhysX/Unity Physics richiede piu wrapper per replay/audit

Decisione: **UE5 per prodotto premium**, Unity solo per companion/admin/rapid prototype.

## 5. Architettura Software

### Moduli

```text
TheWallGame
  Domain/
    Rules, RoundState, Economy, Contract, QuestionResult
  WallPhysics/
    Board, Ball, DropSimulator, ProbabilityModel, Replay
  Quiz/
    QuestionBank, Importer, AdminClient, Validation
  Presentation/
    ShowDirector, CameraDirector, CueTimeline, VFX, Audio
  UI/
    BroadcastHUD, StageUI, IsolationUI, OperatorUI
  Persistence/
    SaveGame, MatchLedger, Telemetry, AuditLog
  Network/
    MultiplayerSession, RoleSync, SpectatorSync
```

### Cartelle UE

```text
/Source/TheWall/
  Public/
    Domain/
    Physics/
    Quiz/
    Presentation/
    Persistence/
  Private/
    Domain/
    Physics/
    Quiz/
    Presentation/
    Persistence/

/Content/TheWall/
  Blueprints/Core/
  Blueprints/Wall/
  Blueprints/UI/
  Data/Rulesets/
  Data/Questions/
  Materials/LED/
  Materials/Ball/
  Niagara/
  Audio/Cues/
  Cinematics/Cameras/
  Maps/Studio/
```

### Pattern

- **State Machine** per round e transizioni.
- **Event Bus** per UI/VFX/audio senza accoppiare gameplay e presentazione.
- **Data Assets** per ruleset, prize tables, physics profile.
- **Command Queue** per input stage/isolation.
- **Replay Ledger** per seed, domande, risposte, slot e payout.
- **Ports/Adapters**: logica pura C++ separata da UE Components dove possibile.

Flusso:

```text
QuestionBank -> RoundStateMachine -> PlayerInput
       |              |                 |
       v              v                 v
AnswerResult -> BallDropRequest -> WallPhysics
       |              |                 |
       v              v                 v
PrizeBank <---- SlotDetector <---- BallLanded
       |
       v
ShowDirector -> UI / Camera / VFX / Audio
```

## 6. Classi Principali UE C++

### Ruleset

```cpp
UENUM(BlueprintType)
enum class EWallRound : uint8
{
    FreeFall,
    Round2,
    Round3
};

USTRUCT(BlueprintType)
struct FPrizeTable
{
    GENERATED_BODY()

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
    TArray<int64> SlotValues;

    int64 GetValue(int32 SlotIndex) const
    {
        return SlotValues.IsValidIndex(SlotIndex) ? SlotValues[SlotIndex] : 0;
    }
};

UCLASS(BlueprintType)
class UWallRulesetAsset : public UDataAsset
{
    GENERATED_BODY()

public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly) int32 DropZoneCount = 7;
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly) int32 SlotCount = 15;
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly) int64 ContractBonus = 20000;
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly) TMap<EWallRound, FPrizeTable> PrizeTables;
};
```

### Drop request

```cpp
USTRUCT(BlueprintType)
struct FBallDropRequest
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString BallId;
    UPROPERTY(BlueprintReadOnly) EWallRound Round;
    UPROPERTY(BlueprintReadOnly) int32 DropZone = 0;
    UPROPERTY(BlueprintReadOnly) EBallColor Color = EBallColor::White;
    UPROPERTY(BlueprintReadOnly) int32 Seed = 0;
    UPROPERTY(BlueprintReadOnly) bool bAuditFairMode = true;
};
```

### Ball actor

```cpp
void AWallBall::InitializeDrop(const FBallDropRequest& Request, const FTransform& LauncherTransform)
{
    DropRequest = Request;
    SetActorTransform(LauncherTransform);

    FRandomStream Rng(Request.Seed);
    const float LateralJitter = Rng.FRandRange(-0.5f, 0.5f); // cm
    const float Spin = Rng.FRandRange(-0.35f, 0.35f);

    BallMesh->SetSimulatePhysics(true);
    BallMesh->SetEnableGravity(true);
    BallMesh->BodyInstance.bUseCCD = true;
    BallMesh->SetPhysicsLinearVelocity(FVector(LateralJitter, 0.0f, -15.0f));
    BallMesh->SetPhysicsAngularVelocityInRadians(FVector(0.0f, Spin, 0.0f));

    ApplyBallMaterial(Request.Color);
}
```

### Slot detector

```cpp
void UWallSlotDetector::HandleBeginOverlap(
    UPrimitiveComponent* Overlapped,
    AActor* OtherActor,
    UPrimitiveComponent* OtherComp,
    int32 BodyIndex,
    bool bFromSweep,
    const FHitResult& Sweep)
{
    AWallBall* Ball = Cast<AWallBall>(OtherActor);
    if (!Ball || Ball->HasLanded()) return;

    Ball->MarkLanded(SlotIndex);

    FBallLandedEvent Event;
    Event.BallId = Ball->GetBallId();
    Event.Color = Ball->GetColor();
    Event.SlotIndex = SlotIndex;
    Event.SlotValue = Ruleset->PrizeTables[Ball->GetRound()].GetValue(SlotIndex);

    EventBus->Publish(Event);
}
```

### Round state machine

```cpp
void UWallRoundStateMachine::ResolveAnswer(const FQuestionAnswer& Answer)
{
    const bool bCorrect = CurrentQuestion.CorrectAnswerId == Answer.AnswerId;
    CorrectAnswerCount += bCorrect ? 1 : 0;

    const EBallColor ResultColor = bCorrect ? EBallColor::Green : EBallColor::Red;
    const int32 BallCount = GetBallCountForCurrentQuestion();

    for (int32 i = 0; i < BallCount; ++i)
    {
        FBallDropRequest Drop;
        Drop.BallId = MakeBallId(CurrentRound, CurrentQuestionIndex, i);
        Drop.Round = CurrentRound;
        Drop.DropZone = StageSelections.GetDropZone(i);
        Drop.Color = ResultColor;
        Drop.Seed = SeedService->NextSeed(Drop.BallId);
        BallDropQueue->Enqueue(Drop);
    }
}
```

## 7. Blueprint Architecture

Core Blueprints:

```text
BP_WallGameMode
  - owns match setup, role assignment, ruleset

BP_WallBoard
  - builds wall from BoardLayout data
  - exposes DropBall(DropRequest)

BP_ShowDirector
  - receives gameplay events
  - plays cue timelines
  - routes camera/audio/VFX

BP_StageConsole
  - drop zone selection
  - double/triple/wall-to-wall commands

BP_IsolationRoom
  - question display
  - answer lock
  - hides bank and wall state

WBP_BroadcastHUD
  - bank, question panel, timer, answer options, slot values

WBP_OperatorDashboard
  - next cue, force safe pause, replay ledger, QA indicators
```

Blueprint event convention:

```text
OnQuestionRevealed
OnAnswerLocked
OnDropQueued
OnBallReleased
OnBallHitPeg
OnBallLanded
OnBankChanged
OnContractOffered
OnContractDecisionLocked
OnFinalReveal
```

## 8. Quiz System

### Dati domanda

```json
{
  "id": "q_2026_000143",
  "locale": "it-IT",
  "category": "Cinema",
  "difficulty": 0.62,
  "roundCompatibility": ["FreeFall", "Round2", "Round3"],
  "prompt": "Quale film ha vinto l'Oscar come miglior film nel 1998?",
  "answers": [
    {"id": "a", "text": "Titanic"},
    {"id": "b", "text": "Salvate il soldato Ryan"},
    {"id": "c", "text": "La vita e bella"},
    {"id": "d", "text": "Shakespeare in Love"}
  ],
  "correctAnswerId": "a",
  "explanation": "Titanic ha vinto come miglior film alla cerimonia del 1998.",
  "source": "internal_verified",
  "status": "approved",
  "createdAt": "2026-05-23T10:00:00Z"
}
```

### Schema SQL

```sql
CREATE TABLE question (
  id TEXT PRIMARY KEY,
  locale TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty REAL NOT NULL CHECK (difficulty >= 0 AND difficulty <= 1),
  prompt TEXT NOT NULL,
  correct_answer_id TEXT NOT NULL,
  explanation TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE answer (
  question_id TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  answer_id TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  PRIMARY KEY (question_id, answer_id)
);

CREATE TABLE question_round (
  question_id TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  round_name TEXT NOT NULL,
  PRIMARY KEY (question_id, round_name)
);

CREATE TABLE match_question_log (
  match_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  round_name TEXT NOT NULL,
  player_answer_id TEXT,
  correct BOOLEAN,
  response_ms INTEGER,
  PRIMARY KEY (match_id, question_id)
);
```

### Backend amministrabile

Stack consigliato:

- **FastAPI + PostgreSQL** per admin e import/export
- **SQLite** embedded per build offline/console
- **OpenAPI** generato per tool interni
- export JSON firmato con hash per puntate live

Endpoint:

```text
GET    /questions?locale=it-IT&category=...
POST   /questions
POST   /questions/import/json
GET    /questions/export/json
POST   /matches/{id}/lock-question-set
POST   /matches/{id}/answer
GET    /matches/{id}/ledger
```

Validazioni:

- nessuna risposta duplicata
- lunghezza prompt adatta a UI TV
- compatibilita round/numero opzioni
- difficolta bilanciata per episodio
- fonte editoriale obbligatoria per domande approvate

## 9. Rendering, VFX e UI Broadcast

### Look

Pilastro visivo: nero lucido, LED ad alto contrasto, blu elettrico/rosso/verde, metallo satinato, riflessi controllati.

Pipeline UE:

- Lumen GI/reflections per studio
- Nanite per scenografia non deformabile
- Niagara per particelle
- Post-process con bloom controllato, vignette leggera, lens dirt minimo
- Tone mapping cinematico ma leggibile in UI

### Materiale LED

Logica shader:

```hlsl
float cell = LedMask(UV);
float scan = 0.85 + 0.15 * sin((UV.y * 900.0) + Time * 18.0);
float pulse = 1.0 + 0.35 * sin(Time * PulseSpeed + Phase);
float edge = saturate(1.0 - distance(UV, 0.5) * 1.8);

float3 emissive = LedColor * cell * scan * pulse * edge * Intensity;
return emissive;
```

Material instances:

- `MI_LED_Blue_Idle`
- `MI_LED_Green_Win`
- `MI_LED_Red_Loss`
- `MI_LED_Gold_Jackpot`
- `MI_Ball_White_Neutral`
- `MI_Ball_Green_Active`
- `MI_Ball_Red_Danger`

### VFX cues

```text
Ball release: launcher glow + short air puff
Peg hit: micro spark / light ripple, non cartoon
Slot land green: vertical LED surge upward
Slot land red: downward red wipe + low-frequency hit
Correct answer: green bloom + rising chime
Wrong answer: red shutter + bass drop
Contract: paper/LED hybrid animation, isolated silence
Final reveal: blackout beat -> bank pulse -> contestant reaction camera
```

### UI/UX televisiva

Principi:

- leggibilita da 3-5 metri
- animazioni lente abbastanza per essere lette, rapide abbastanza per tensione live
- font condensed broadcast, numeri tabulari
- bank sempre protagonista, ma nascosto nella vista isolamento
- slot values grandi e persistenti
- niente pannelli "app mobile"; deve sembrare broadcast graphics

Screen:

```text
Stage View:
  Wall full height, slot values, bank, drop zone selector, question compact.

Isolation View:
  question, answer buttons, timer, no bank, no wall outcome.

Operator View:
  current state, next cue, physics health, question status, replay ledger, manual pause.

Spectator/Broadcast View:
  camera-driven, no debug, lower thirds and dramatic reveals.
```

## 10. Regia e Feeling TV

Timing consigliati:

```text
Question reveal: 1.2s
Answer read beat: 2.0s
Answer lock flash: 0.4s
Pre-drop silence: 1.0-2.5s
Ball release mechanical cue: 0.3s
Ball fall camera tracking: live physics
Slot impact hold: 0.8s
Bank count-up/down: 1.2-3.5s, duration proportional to value
Contract decision: 8-14s with room tone and heartbeat
Final reunion: 4s silence before payout reveal
```

Camera language:

- wide hero shot for SuperDrop
- top launcher close-up before high-risk drops
- mid-wall tracking for bounces
- low slot close-up for high value lanes
- reaction cam insert after near miss
- no camera cut that hides a decisive collision

Audio:

- layer 1: studio bed, sub-bass pulses
- layer 2: mechanical launcher/ball impacts
- layer 3: LED whooshes
- layer 4: answer stingers
- layer 5: crowd sweetening / applause states

Drama Director:

```text
GameplayEvent -> CueTimeline -> CameraCue + AudioCue + VFXCue + UIAnimation
```

Non deve cambiare la fisica dopo il rilascio. Deve orchestrare percezione e ritmo.

## 11. Multiplayer e Networking

### Modalita locale

- due controller/tastiere
- isolamento simulato su seconda finestra o tablet companion
- stage view e broadcast view su monitor separati

### Modalita online

Authoritative server:

- gestisce domanda, risposta, seed, bank
- simula fisica o valida risultato client
- replica transform palline ai client

Per fedelta:

1. server genera seed
2. server simula o avvia lockstep
3. client riceve `DropRequest`
4. client visualizza fisica localmente
5. server invia `BallLandedEvent` autorevole
6. se divergenza visiva > soglia, correggere solo dopo landing con transizione invisibile

## 12. Salvataggi, Replay e Audit

Ogni match salva:

- ruleset version
- board version
- physics profile
- question set hash
- risposte e tempi
- seed per pallina
- slot landing
- bank progression
- contract decision
- payout

Replay deterministic:

```text
MatchLedger + Ruleset + PhysicsProfile + BoardVersion = Full Replay
```

Se una build cambia Chaos o collision mesh, il replay deve poter usare:

- replay transform baked per broadcast
- oppure physics version pinning per audit

## 13. Performance Budget

Target:

```text
Render: 60 FPS locked
Physics internal: 120-240 Hz
Frame time: 16.6 ms
Physics budget during SuperDrop: < 3 ms
UI budget: < 1.5 ms
Niagara budget: < 2 ms
GPU target: mid/high PC or console
```

Tecniche:

- HISM per LED cells e pioli
- collisioni primitive
- LOD per pubblico/studio
- Niagara fixed bounds
- UI invalidation panels
- no tick per componenti statici
- event-driven bank/UI updates

## 14. Testing

### Test automatici

```text
Domain:
  - bank never negative
  - contract formula
  - round transitions
  - correct/incorrect color assignment

Quiz:
  - import JSON
  - opzioni per round
  - no duplicate answer text

Physics:
  - every drop lands in a slot
  - no ball escapes board
  - histogram within tolerance
  - same seed replay within tolerance

Presentation:
  - cue fired for every gameplay event
  - no isolation leakage
```

### Monte Carlo QA

```cpp
for (int32 Zone = 0; Zone < Ruleset.DropZoneCount; ++Zone)
{
    TArray<int32> Histogram;
    Histogram.Init(0, Ruleset.SlotCount);

    for (int32 i = 0; i < 100000; ++i)
    {
        const int32 Seed = HashCombine(Zone, i);
        const int32 Slot = HeadlessSimulateDrop(Zone, Seed);
        Histogram[Slot]++;
    }

    ValidateDistribution(Zone, Histogram, ExpectedDistribution[Zone], Tolerance);
}
```

## 15. Roadmap di Produzione

### Milestone 1 - Vertical Slice

- board fisico 7x15
- una ruleset completa
- domande JSON
- Free Fall playable
- slot detector e bank
- basic LED/VFX

### Milestone 2 - Format Complete

- Round 2/3
- isolamento
- contratto
- Double/Triple/Wall-to-Wall
- replay ledger
- admin import/export

### Milestone 3 - Broadcast Polish

- lighting cinematico
- camera director
- audio cues
- Niagara final
- operator dashboard
- performance lock 60 FPS

### Milestone 4 - Hardening

- Monte Carlo calibration
- network optional
- save/replay
- QA automation
- localizzazione e prize tables per broadcaster

## 16. Tradeoff Tecnici

### Fisica reale vs animazione fake

Scelta: fisica reale con seed deterministico.

Pro:

- credibilita immediata
- replay e audit
- cadute non ripetitive

Contro:

- QA piu costosa
- dipendenza da versione engine/solver
- richiede calibrazione statistica

Mitigazione: physics profile bloccato, Monte Carlo e replay transform baked.

### Unreal vs Unity

Scelta: Unreal per main product.

Unity resta valido per:

- prototype rapido
- admin tool
- companion app
- WebGL demo non broadcast

### Seed selection vs fairness

Scelta:

- Fair Mode: RNG auditato, nessun pilotaggio.
- Entertainment Mode: seed selection pre-release con log e vincoli.

Mai manipolare collisioni durante la caduta.

## 17. Definition of Done

Il progetto e pronto per produzione quando:

- tutte le regole sono data-driven
- tutte le cadute sono fisiche, riproducibili e loggate
- round completo giocabile end-to-end
- admin puo importare/esportare domande
- replay ledger ricostruisce una partita
- SuperDrop a 7 palline resta stabile a 60 FPS
- UI stage/isolation/broadcast non perde informazioni vietate
- Monte Carlo mostra distribuzioni credibili e stabili
- la regia puo orchestrare tensione senza toccare l'esito fisico live

