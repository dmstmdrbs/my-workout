import styled from '@emotion/native';

const BtnWrapper = styled.View `
  width: 95%;
  align-items: center;
  padding: 10px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.mainColors['100']};
`;
const AddBtn = styled.TouchableOpacity `
  width: 120px;
  height: 40px;
  justify-content: center;
  align-items: center;

  border-radius: 5px;
  background: ${(props) => props.theme.mainColors['500']};
`;
export { BtnWrapper, AddBtn };