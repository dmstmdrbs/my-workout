import { useState } from 'react';
import { useRecoilState } from 'recoil';
import { currentTimeState } from '../store';
import BackgroundTimer from 'react-native-background-timer';

/**
    android/src/~~~/BackgroundTimerModule.java
    
    @ReactMethod
    public void addListener(String eventName) {
        // Keep: Required for RN built in Event Emitter Calls.
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        // Keep: Required for RN built in Event Emitter Calls.
    }
*/
export default useStopwatch = () => {
    const [currentTime, setCurrentTime] = useRecoilState(currentTimeState);

    const [isWorking, setIsWorking] = useState(false); // 스톱워치가 동작 중인지
    const [isRunning, setIsRunning] = useState(false); // 스톱워치가 실행 중인지

    const handleStart = () => {
        setIsWorking(true); // activate stopwatch
        setIsRunning(true); // start count time

        BackgroundTimer.runBackgroundTimer(() => {
            setCurrentTime((prev) => prev + 1);
        }, 1000);
    };
    const handlePause = () => {
        BackgroundTimer.stopBackgroundTimer();
        setIsRunning(false);
    };
    const handleResume = () => {
        setIsRunning(true);
        BackgroundTimer.runBackgroundTimer(() => {
            setCurrentTime((prev) => prev + 1);
        }, 1000);
    };
    const handleReset = () => {
        BackgroundTimer.stopBackgroundTimer();
        setIsWorking(false);
        setIsRunning(false);
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
        isRunning,
        setIsWorking,
        handleStart,
        handlePause,
        handleReset,
        handleResume,
        formatCurrentTime,
    };
};