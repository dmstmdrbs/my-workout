import { atom } from 'recoil';

const myState = atom({
    key: 'myAtom',
    default: 'state',
});

export { myState };