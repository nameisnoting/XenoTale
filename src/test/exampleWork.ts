import { emptyWork } from '../domain/defaults';
import { populateGarden } from '../../tests/fixtures/garden';

export const exampleWork = () => populateGarden(emptyWork('XenoTale'));
