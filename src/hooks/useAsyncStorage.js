import AsyncStorage from '@react-native-async-storage/async-storage';

export const storeData = async(key, value) => {
    try {
        if (typeof value === 'object') {
            const jsonValue = JSON.stringify(value);
            await AsyncStorage.setItem(key, jsonValue);
        } else {
            await AsyncStorage.setItem(key, value);
        }
    } catch (e) {
        // saving error
    }
};

export const getData = async(key) => {
    try {
        const jsonValue = await AsyncStorage.getItem(key);

        return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (e) {
        // error reading value
    }
};