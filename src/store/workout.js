import { atom, selector } from 'recoil';
import { getData } from '../hooks/useAsyncStorage';

const currentDateState = atom({
    key: 'currentDate',
    default: new Date(),
});

const forceUpdateWorkoutState = atom({
    key: 'forceUpdateWorkout',
    default: 0,
});
const storedWorkoutState = selector({
    key: 'storedWorkout',
    get: async({get }) => {
        get(forceUpdateWorkoutState); // 운동 추가하면 강제 업데이트
        const selectedDate = get(currentDateState);
        try {
            const data = await getData('@stored_workout');
            if (!data) return [];

            return data.filter(
                (workout) =>
                workout.enrollmentDate.toString().slice(0, 10) ===
                selectedDate.toISOString().slice(0, 10)
            );
        } catch (e) {
            console.log(e);
            return [];
        }
    },
});

export { currentDateState, storedWorkoutState, forceUpdateWorkoutState };