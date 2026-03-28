/**
 * Ecosystem router — returns the right extractor for the detected ecosystem.
 */

import * as npm from './npm.mjs';
import * as pip from './pip.mjs';
import * as go from './go.mjs';
import * as cargo from './cargo.mjs';
import * as maven from './maven.mjs';
import * as nuget from './nuget.mjs';

const REGISTRY = { npm, pip, go, cargo, maven, nuget };

export function getEcosystem(name) {
  const eco = REGISTRY[name];
  if (!eco) throw new Error(`Unknown ecosystem "${name}". Supported: ${Object.keys(REGISTRY).join(', ')}`);
  return eco;
}

export function listEcosystems() {
  return Object.keys(REGISTRY);
}
