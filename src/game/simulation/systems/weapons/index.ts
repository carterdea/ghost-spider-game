/** The hero's arsenal: what is carried, what a bomb catches, what a shot does. */
export type { ArsenalState, GadgetSpec } from "./arsenal";
export {
  ARSENAL,
  canFire,
  createArsenal,
  GADGET_ORDER,
  gadgetAt,
  nextGadget,
  rechargeProgress,
  refillArsenal,
  spendCharge,
  tickArsenal,
} from "./arsenal";
export type { BurstHit, BurstTarget } from "./bomb";
export {
  burstDamage,
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
