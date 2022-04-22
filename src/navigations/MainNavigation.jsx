import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import WorkoutNavigation from './WorkoutNavigation';

const Tab = createBottomTabNavigator();

const MainNavigation = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="운동기록"
        component={WorkoutNavigation}
        options={{
          tabBarActiveTintColor: '#171E46',
          tabBarInactiveTintColor: '#8E91A2',
        }}
      />
      {/* <Tab.Screen
        name="AddWorkout"
        component={AddWorkout}
        options={{
          tabBarActiveTintColor: '#171E46',
          tabBarInactiveTintColor: '#8E91A2',
        }}
      /> */}
    </Tab.Navigator>
  );
};

export default MainNavigation;
