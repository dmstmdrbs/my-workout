import { bench, squat, deadlift, allWorkout } from '../constants/workout';
import { atom, selector } from 'recoil';

export class Workout {
    constructor(name) {
        this.id = Math.random().toString(36).substring(2, 11);
        this.name = name;
        this.sets = [];
        this.memo = '';
    }
}

const dummyWorkoutList = [bench, squat, deadlift];

const currentTimeState = atom({
    key: 'currentTime',
    default: 0,
});

const workoutListState = atom({
    key: 'workoutList',
    default: [...dummyWorkoutList],
});

const workoutSearchState = atom({
    key: 'workoutSearchValue',
    default: '',
});
const workoutCategoryState = atom({
    key: 'workoutCategoryValue',
    default: 'likes',
});

const allWorkoutState = atom({
    key: 'allWorkoutList',
    default: [...allWorkout],
});

const searchWorkoutSelector = selector({
    key: 'searchWorkoutList',
    get: ({get }) => {
        const workouts = get(allWorkoutState);
        const searchValue = get(workoutSearchState);

        return [
            ...workouts.filter((workout) => workout.name.includes(searchValue)),
        ];
    },
});
const categoryWorkoutSelector = selector({
    key: 'categoryWorkoutList',
    get: ({get }) => {
        const workouts = get(allWorkoutState);
        const selectedCategory = get(workoutCategoryState);
        const likes = [];
        if (selectedCategory === 'likes') return likes;

        return workouts.filter((workout) => workout.category === selectedCategory);
    },
});

export {
    currentTimeState,
    workoutListState,
    workoutCategoryState,
    workoutSearchState,
    allWorkoutState,
    searchWorkoutSelector,
    categoryWorkoutSelector,
};