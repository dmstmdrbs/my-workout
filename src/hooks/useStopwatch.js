import { useState, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { currentTimeState } from '../store';

export default useStopwatch = () => {
    const timerRef = useRef(null); // setInterval
    const [currentTime, setCurrentTime] = useRecoilState(currentTimeState);

    const [isWorking, setIsWorking] = useState(false); // 스톱워치가 동작 중인지
    const [isPaused, setIsPaused] = useState(false); // 스톱워치가 실행 중인지

    const handleStart = () => {
        setIsWorking(true); // activate stopwatch
        setIsPaused(true); // start count time

        timerRef.current = setInterval(() => {
            setCurrentTime((prev) => prev + 1);
        }, 1000);
    };
    const handlePause = () => {
        clearInterval(timerRef.current);
        setIsPaused(false);
    };
    const handleResume = () => {
        setIsPaused(true);
        timerRef.current = setInterval(() => {
            setCurrentTime((prev) => prev + 1);
        }, 1000);
    };
    const handleReset = () => {
        clearInterval(timerRef.current);
        setIsWorking(false);
        setIsPaused(false);
        setCurrentTime(0);
    };

    const formatCurrentTime = () => {
        const getSeconds = `0${currentTime % 60}`.slice(-2);
        const minutes = `${Math.floor(currentTime / 60)}`;
        const getMinutes = `0${minutes % 60}`.slice(-2);
        const getHours = `0${Math.floor(currentTime / 3600)}`.slice(-2);

        return `${getHours} : ${getMinutes} : ${getSeconds}`;
    };

    return {
        isWorking,
        isPaused,
        setIsWorking,
        handleStart,
        handlePause,
        handleReset,
        handleResume,
        formatCurrentTime,
    };
};