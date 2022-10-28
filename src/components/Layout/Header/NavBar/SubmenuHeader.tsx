import { Center } from '@chakra-ui/layout'
import { Flex, Stack, Text, useColorModeValue } from '@chakra-ui/react'
import { upperFirst } from 'lodash'

type ExpandedMenuItemProps = {
  title?: string
  description?: string
  alert?: string
  onBackClick?: () => void
}

export const SubmenuHeader = ({ title, description }: ExpandedMenuItemProps) => {
  const headerColor = useColorModeValue('black', 'white')
  const descriptionTextColor = useColorModeValue('black', 'whiteAlpha.600')

  return (
    <Stack flexDir='column' px={2}>
      <Flex mb={3} justifyContent='space-between' alignItems='center'>
        <Center fontWeight='bold' color={headerColor} fontSize='sm' flex={1} pr={7}>
          {upperFirst(title)}
        </Center>
      </Flex>
      {description && (
        <Text fontSize='sm' px={1} color={descriptionTextColor}>
          {description}
        </Text>
      )}
    </Stack>
  )
}
