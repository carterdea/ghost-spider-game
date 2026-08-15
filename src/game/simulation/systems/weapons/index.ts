/** The hero's arsenal: what is carried, what a bomb catches, what a shot does. */
export type { ArsenalState } from "./arsenal";
export {
  ARSENAL,
  canFire,
  createArsenal,
  nextGadget,
  refillArsenal,
  spendCharge,
  tickArsenal,
} from "./arsenal";
export type { BurstTarget } from "./bomb";
export {
  catchInBurst,
  fuseEndsAt,
  fuseProgress,
  throwVelocity,
  WEB_BOMB,
} from "./bomb";
export type { AimTarget } from "./strike";
export {
  IMPACT_WEB,
  knockbackVelocity,
  pickYankTarget,
  WEB_LINE,
  yankVelocity,
} from "./strike";
