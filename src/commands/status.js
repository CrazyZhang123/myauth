import { showAccountPool } from './switch.js';

export async function status() {
  await showAccountPool({ interactive: false });
}
