import { Schema } from "effect"
import { DialModule, generateDial } from "./dial"
import { generateKeypad, KeypadModule } from "./keypad"
import { createRng, type Rng } from "./rng"
import { generateValve, ValveModule } from "./valve"
import { generateWires, LETTERS, WiresModule } from "./wires"

export const Difficulty = Schema.Literals(["easy", "normal", "hard"])
export type Difficulty = typeof Difficulty.Type

/** What the case shows on the outside, which any module's rules may refer to. */
export const Edgework = Schema.Struct({ serial: Schema.String.check(Schema.isPattern(/^[A-Z]{2}\d[A-Z]{2}\d$/)) })
export type Edgework = typeof Edgework.Type

export const BombModule = Schema.Union([WiresModule, KeypadModule, DialModule, ValveModule])
export type BombModule = typeof BombModule.Type
export type ModuleKind = BombModule["kind"]

/** Module i sits in slot i on the case. */
export const Bomb = Schema.Struct({
  edgework: Edgework,
  modules: Schema.Tuple([WiresModule, KeypadModule, DialModule, ValveModule]),
})
export type Bomb = typeof Bomb.Type

function generateSerial(rng: Rng) {
  const letter = () => rng.pick(LETTERS)
  const digit = () => String(rng.int(0, 9))
  return [letter(), letter(), digit(), letter(), letter(), digit()].join("")
}

/** The same seed and difficulty always give the same bomb. */
export function generateBomb(seed: number, difficulty: Difficulty): Bomb {
  const rng = createRng(seed)
  const serial = generateSerial(rng)
  // New modules draw after the earlier ones, so seeds stored before they existed keep their wires.
  return {
    edgework: { serial },
    modules: [
      generateWires(rng, { serial, difficulty }),
      generateKeypad(rng, { difficulty }),
      generateDial(rng, { difficulty }),
      generateValve(rng, { difficulty }),
    ],
  }
}
