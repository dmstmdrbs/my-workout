import { bench, squat, deadlift, allWorkout } from '../constants/workout';
import { atom, selector } from 'recoil';

export class Workout {
    constructor(name, category = '전신', currentDate = new Date()) {
        this.id = Math.random().toString(36).substring(2, 11);
        this.name = name;
        this.category = category;
        this.sets = [];
        this.memo = '';
        this.enrollmentDate = currentDate;
    }
}

const dummyWorkoutList = [bench, squat, deadlift];

// 현재 타이머 시간
const currentTimeState = atom({
    key: 'currentTime',
    default: 0,
});

// 오늘의 운동 리스트
const workoutListState = atom({
    key: 'workoutList',
    default: [...dummyWorkoutList],
});

// 운동 추가 -> 검색어
const workoutSearchState = atom({
    key: 'workoutSearchValue',
    default: '',
});
// 운동 추가 -> 카테고리 Chip
const workoutCategoryState = atom({
    key: 'workoutCategoryValue',
    default: 'likes',
});

// 추가할 수 있는 모든 운동 리스트
const allWorkoutState = atom({
    key: 'allWorkoutList',
    default: [...allWorkout],
});

// 운동 추가 -> 검색어 -> 해당하는 운동 리스트
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
// 운동 추가 -> 카테고리 -> 해당하는 운동 리스트
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