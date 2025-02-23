import { Modal, ModalContent, ModalOverlay } from '@chakra-ui/modal'
import {
  Button,
  FormControl,
  FormErrorMessage,
  Heading,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Link,
  ModalCloseButton,
  VStack,
} from '@chakra-ui/react'
import { WalletConnectIcon } from 'components/Icons/WalletConnectIcon'
import { Text } from 'components/Text'
import { ipcListeners } from 'electron-shim'
import { useWalletConnect } from 'plugins/walletConnectToDapps/WalletConnectBridgeContext'
import type { FC } from 'react'
import { useEffect } from 'react'
import { useCallback } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { FaQrcode } from 'react-icons/fa'
import { useTranslate } from 'react-polyglot'

type Props = {
  isOpen: boolean
  onClose(): void
  scannedQr?: string
}

type FormValues = {
  uri: string
}

export const ConnectModal: FC<Props> = ({ isOpen, onClose, scannedQr }) => {
  const translate = useTranslate()

  const { register, handleSubmit, control, formState, setValue, getValues } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: { uri: '' },
  })
  const canConnect = !!useWatch({ control, name: 'uri' })

  const { connect, isConnected } = useWalletConnect()
  const handleConnect = useCallback(
    async (values: FormValues) => {
      if (!values) values = getValues()
      await connect(values.uri)
      onClose()
    },
    [connect, getValues, onClose],
  )

  useEffect(() => {
    if (isConnected) onClose()
  }, [isConnected, onClose])

  const scan = () => {
    ipcListeners
      .appReadQr()
      .then(value => {
        console.log(value)
        if (value?.startsWith('wc:')) {
          setValue('uri', value)
          handleSubmit(handleConnect)
        }
      })
      .catch(console.error)
  }

  useEffect(() => {
    console.log('scanned qr', scannedQr)
    if (!scannedQr) return
    if (scannedQr.startsWith('wc:')) {
      setValue('uri', scannedQr)
      connect(scannedQr)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedQr])

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant='header-nav'>
      <ModalOverlay />

      <ModalContent
        width='full'
        textAlign='center'
        p={8}
        borderRadius={{ base: 0, md: 'xl' }}
        minWidth={{ base: '100%', md: '500px' }}
        maxWidth={{ base: 'full', md: '500px' }}
      >
        <ModalCloseButton position='absolute' color='gray.500' />

        <form onSubmit={handleSubmit(handleConnect)}>
          <VStack spacing={8}>
            <WalletConnectIcon fontSize='9xl' />
            <Heading flex={1} fontSize='xl'>
              <Text translation='plugins.walletConnectToDapps.modal.connect.title' />
            </Heading>
            <Button
              colorScheme='blue'
              as={Link}
              variant='link'
              href='https://www.keepkey.com/dapps'
              isExternal
            >
              {translate('plugins.walletConnectToDapps.modal.connect.howTo')}
            </Button>
            <FormControl isInvalid={Boolean(formState.errors.uri)} mb={6}>
              <InputGroup size='lg'>
                <Input
                  {...register('uri')}
                  type='text'
                  placeholder={translate(
                    'plugins.walletConnectToDapps.modal.connect.linkPlaceholder',
                  )}
                  autoFocus // eslint-disable-line jsx-a11y/no-autofocus
                  variant='filled'
                />
                <InputRightElement>
                  <IconButton
                    aria-label='Scan QR'
                    onClick={() => scan()}
                    icon={<FaQrcode color='gray.300' />}
                  />
                </InputRightElement>
              </InputGroup>
              <FormErrorMessage>{formState.errors?.uri?.message}</FormErrorMessage>
            </FormControl>
            <Button
              isDisabled={!canConnect}
              colorScheme='blue'
              size='lg'
              width='full'
              type='submit'
              variant='solid'
              isLoading={formState.isSubmitting}
            >
              {translate('plugins.walletConnectToDapps.modal.connect.connect')}
            </Button>
          </VStack>
        </form>
      </ModalContent>
    </Modal>
  )
}
