const bench = {
    id: Math.random().toString(36).substring(2, 11),
    name: '벤치프레스',
    sets: [{
            setId: Math.random().toString(36).substring(2, 11),
            weight: 60,
            reps: 15,
            done: false,
        },
        {
            setId: Math.random().toString(36).substring(2, 11),
            weight: 70,
            reps: 12,
            done: false,
        },
        {
            setId: Math.random().toString(36).substring(2, 11),
            weight: 75,
            reps: 9,
            done: false,
        },
    ],
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

class WorkoutSample {
    constructor(name, category) {
        this.id = Math.random().toString(32).substring(2, 11);
        this.name = name;
        this.category = category;
    }
}
const allWorkout = [
    new WorkoutSample('스쿼트', '하체'),
    new WorkoutSample('벤치프레스', '가슴'),
    new WorkoutSample('레그프레스', '하체'),
    new WorkoutSample('덤벨프레스', '가슴'),
    new WorkoutSample('랫풀다운', '등'),
    new WorkoutSample('크런치', '코어'),
    new WorkoutSample('덤벨플라이', '가슴'),
    new WorkoutSample('바벨로우', '등'),
    new WorkoutSample('시티드로우', '등'),
    new WorkoutSample('케이블플라이', '가슴'),
    new WorkoutSample('사이드레터럴레이즈', '어깨'),
    new WorkoutSample('덤벨컬', '팔'),
    new WorkoutSample('라잉트라이셉스익스텐션', '팔'),
    new WorkoutSample('덤벨로우', '등'),
    new WorkoutSample('오버헤드프레스', '어깨'),
    new WorkoutSample('런지', '하체'),
    new WorkoutSample('프론트레이즈', '어깨'),
    new WorkoutSample('바벨컬', '팔'),
    new WorkoutSample('레그레이즈', '코어'),
    new WorkoutSample('컨벤셔널데드리프트', '하체'),
    new WorkoutSample('행잉레그레이즈', '코어'),
    new WorkoutSample('루마니안데드리프트', '등'),
];
export { bench, squat, deadlift, allWorkout };