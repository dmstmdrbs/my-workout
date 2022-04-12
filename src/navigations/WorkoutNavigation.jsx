import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import Workout from '../screens/workout/Workout';
import AddWorkout from '../screens/workout/AddWorkout';

const Stack = createNativeStackNavigator();

export default WorkoutNavigation = () => {
  return (
    <Stack.Navigator
      initialRouteName="Workout"
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#474C65',
        },
        headerTitleStyle: {
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          color: 'white',
        },
      }}
    >
      <Stack.Screen
        name="Workout"
        component={Workout}
        options={{
          title: '운동',
        }}
      />
      <Stack.Screen
        name="AddWorkout"
        component={AddWorkout}
        options={{ title: '운동 추가' }}
      />
    </Stack.Navigator>
  );
};
