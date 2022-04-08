import { atom } from 'recoil';

const currentTimeState = atom({
    key: 'currentTime',
    default: 0,
});

export { currentTimeState };