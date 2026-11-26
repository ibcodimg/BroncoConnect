import type { BuildingFeature } from '@shared/types';
import type { ComponentType } from 'react';
import GraphingCalculator from './GraphingCalculator';

/**
 * Building-specific tools. To add one:
 *   1. add an id to BuildingFeature in shared/types.ts
 *   2. attach it to a building in shared/buildings.ts (FEATURES)
 *   3. register its component here
 */
export const FEATURE_COMPONENTS: Record<BuildingFeature, ComponentType> = {
  'graphing-calculator': GraphingCalculator,
};
