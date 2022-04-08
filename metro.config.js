/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

module.exports = {
    transformer: {
        getTransformOptions: async() => ({
            transform: {
                experimentalImportSupport: false,
                inlineRequires: true,
            },
        }),
    },
    resolver: {
        // javascript 사용시 jsx 사용 가능하도록 metro config 수정
        sourceExts: ['jsx', 'js'],
    },
};