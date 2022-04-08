import { useState, useRef } from 'react';

export default useStopwatch = () => {
    const timerRef = useRef(null); // setInterval
    const [timer, setTimer] = useState(0);
    const [isWorking, setIsWorking] = useState(false); // 스톱워치가 동작 중인지
    const [isPaused, setIsPaused] = useState(false); // 스톱워치가 실행 중인지

    const handleStart = () => {
        setIsWorking(true); // activate stopwatch
        setIsPaused(true); // start count time

        timerRef.current = setInterval(() => {
            setTimer((prev) => prev + 1);
        }, 1000);
    };
    const handlePause = () => {
        clearInterval(timerRef.current);
        setIsPaused(false);
    };
    const handleResume = () => {
        setIsPaused(true);
        timerRef.current = setInterval(() => {
            setTimer((prev) => prev + 1);
        }, 1000);
    };
    const handleReset = () => {
        clearInterval(timerRef.current);
        setIsWorking(false);
        setIsPaused(false);
        setTimer(0);
    };
    const formatTime = () => {
        const getSeconds = `0${timer % 60}`.slice(-2);
        const minutes = `${Math.floor(timer / 60)}`;
        const getMinutes = `0${minutes % 60}`.slice(-2);
        const getHours = `0${Math.floor(timer / 3600)}`.slice(-2);

        return `${getHours} : ${getMinutes} : ${getSeconds}`;
    };

    return {
        isWorking,
        isPaused,
        setIsWorking,
        formatTime,
        handleStart,
        handlePause,
        handleReset,
        handleResume,
    };
};