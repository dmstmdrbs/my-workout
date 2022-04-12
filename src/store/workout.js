import { atom, selector } from 'recoil';
import { Workout } from '.';
import { storeData, getData } from '../hooks/useAsyncStorage';

const currentDateState = atom({
    key: 'currentDate',
    default: new Date(),
});

const storedWorkoutState = selector({
    key: 'storedWorkout',
    get: async({get }) => {
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

export { currentDateState, storedWorkoutState };