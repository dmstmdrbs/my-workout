import React from 'react';
import { View } from 'react-native';
import styled from '@emotion/native';

import useStopwatch from '../hooks/useStopwatch';

const Container = styled.SafeAreaView`
  border-bottom: 1px solid #1b1a17;
  background-color: #efefef;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding-vertical: 10px;
`;
const BtnContainer = styled.View`
  display: flex;
  flex-direction: row;
  justify-content: center;
  padding: 20px;
`;
const StopwatchBtn = styled.TouchableOpacity`
  background-color: #3a3845;
  padding: 10px;
  border-radius: 5px;
`;
const BtnText = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: #f3e9dd;
`;

const StopwatchTimer = styled.Text`
  font-size: 32px;
  font-weight: 600;
  color: #3a3845;
`;
export default Timer = ({ startTitle, endTitle }) => {
  const {
    isWorking,
    isPaused,
    formatTime,
    handleStart,
    handlePause,
    handleReset,
    handleResume,
  } = useStopwatch();

  const handleBtnPress = () => {
    if (!isWorking) handleStart(); // 정지 -> 시작
    if (isWorking && !isPaused) handleResume(); // 일시정지 -> 진행
    if (isWorking && isPaused) handlePause(); // 징행 -> 일시정지
  };

  return (
    <Container>
      <View style={{ alignItems: 'center', padding: 10, marginTop: 10 }}>
        <StopwatchTimer> {formatTime()} </StopwatchTimer>
      </View>
      <BtnContainer>
        <StopwatchBtn onPress={handleBtnPress}>
          <BtnText>{isPaused ? endTitle : startTitle}</BtnText>
        </StopwatchBtn>
        {isWorking && (
          <StopwatchBtn
            onPress={handleReset}
            style={{ backgroundColor: '#8D8DAA' }}
          >
            <BtnText style={{ color: '#DFDFDE' }}>운동 끝내기</BtnText>
          </StopwatchBtn>
        )}
      </BtnContainer>
    </Container>
  );
};
