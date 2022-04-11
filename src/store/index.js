import { atom } from 'recoil';

export class Workout {
    constructor(name) {
        this.id = Math.random().toString(36).substring(2, 11);
        this.name = name;
        this.sets = [];
        this.memo = '';
    }
}
const bench = {
    id: Math.random().toString(36).substring(2, 11),
    name: '벤치프레스',
    sets: [],
    memo: 'rir 3',
};
const squat = {
    id: Math.random().toString(36).substring(2, 11),
    name: '스쿼트',
    sets: [],
    memo: '',
};
const deadlift = {
    id: Math.random().toString(36).substring(2, 11),
    name: '데드리프트',
    sets: [],
    memo: '',
};
const dummyWorkoutList = [bench, squat, deadlift];

const currentTimeState = atom({
    key: 'currentTime',
    default: 0,
});

const workoutListState = atom({
    key: 'workoutList',
    default: [...dummyWorkoutList],
});

export { currentTimeState, workoutListState };