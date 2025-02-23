import {
  Box,
  Button,
  HStack,
  Image,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  useColorModeValue,
  useToast,
  VStack,
} from '@chakra-ui/react'
import type { ethereum } from '@shapeshiftoss/chain-adapters'
import { FeeDataKey } from '@shapeshiftoss/chain-adapters'
import { KnownChainIds } from '@shapeshiftoss/types'
import axios from 'axios'
import { Card } from 'components/Card/Card'
import { KeepKeyIcon } from 'components/Icons/KeepKeyIcon'
import { Text } from 'components/Text'
import { getChainAdapterManager } from 'context/PluginProvider/chainAdapterSingleton'
import { useWallet } from 'hooks/useWallet/useWallet'
import { bn, bnOrZero } from 'lib/bignumber/bignumber'
import { fromBaseUnit } from 'lib/math'
import { useWalletConnect } from 'plugins/walletConnectToDapps/WalletConnectBridgeContext'
import { useCallback } from 'react'
import { useMemo } from 'react'
import { useEffect, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { FaGasPump, FaWrench } from 'react-icons/fa'
import { useTranslate } from 'react-polyglot'
import Web3 from 'web3'

import { AddressSummaryCard } from './AddressSummaryCard'
import { ContractInteractionBreakdown } from './ContractInteractionBreakdown'
import { GasFeeEstimateLabel } from './GasFeeEstimateLabel'
import { GasInput } from './GasInput'
import { ModalSection } from './ModalSection'
import { TransactionAdvancedParameters } from './TransactionAdvancedParameters'
import { TransactionInsight } from './TransactionInsight'
import { TransactionRaw } from './TransactionRaw'
// import { TransactionSimulation } from './TransactionSimulation'

export type TxData = {
  nonce: string
  gasLimit: string
  gasPrice?: string
  maxPriorityFeePerGas: string
  maxFeePerGas: string
  data: string
  to: string
  value: string
}

export const SendTransactionConfirmation = () => {
  const translate = useTranslate()
  const cardBg = useColorModeValue('white', 'gray.850')
  const { state: walletState } = useWallet()

  const adapterManager = useMemo(() => getChainAdapterManager(), [])

  const form = useForm<any>({
    defaultValues: {
      nonce: '',
      gasLimit: '',
      maxPriorityFeePerGas: '',
      maxFeePerGas: '',
      currentFeeAmount: '',
    },
  })

  const [loading, setLoading] = useState(false)
  const [shouldShowGas, setShouldShowGas] = useState(true)

  const { legacyBridge, requests, removeRequest, legacyWeb3 } = useWalletConnect()
  const toast = useToast()

  const currentRequest = requests[0]

  useEffect(() => {
    if (!currentRequest) return
    if (currentRequest.method === 'eth_signTypedData') return setShouldShowGas(false)
    return setShouldShowGas(true)
  }, [currentRequest])

  const onConfirm = useCallback(
    async (txData: any) => {
      if (!legacyWeb3) return
      try {
        setLoading(true)
        await legacyBridge
          ?.approve(requests[0], txData, legacyWeb3)
          .then(() => removeRequest(currentRequest.id))
        removeRequest(currentRequest.id)
      } catch (e) {
        toast({
          title: 'Error',
          description: `Transaction error ${e}`,
          isClosable: true,
        })
      } finally {
        setLoading(false)
      }
    },
    [legacyBridge, currentRequest?.id, removeRequest, requests, toast, legacyWeb3],
  )

  const onReject = useCallback(async () => {
    await legacyBridge?.connector.rejectRequest({
      id: currentRequest.id,
      error: { message: 'Rejected by user' },
    })
    removeRequest(currentRequest.id)
    setLoading(false)
  }, [legacyBridge, currentRequest, removeRequest])

  const [gasFeeData, setGasFeeData] = useState(undefined as any)
  const [priceData, setPriceData] = useState(bn(0))

  const [web3GasFeeData, setweb3GasFeeData] = useState('0')

  // determine which gasLimit to use: user input > from the request > or estimate
  const requestGas = parseInt(currentRequest?.params[0].gas ?? '0x0', 16).toString(10)
  const inputGas = useWatch({ control: form.control, name: 'gasLimit' })

  const [estimatedGas, setEstimatedGas] = useState('0')

  const txInputGas = Web3.utils.toHex(
    !!bnOrZero(inputGas).gt(0) ? inputGas : bnOrZero(requestGas).gt(0) ? requestGas : estimatedGas,
  )
  const walletConnect = useWalletConnect()
  const address = walletConnect.legacyBridge?.connector.accounts
    ? walletConnect.legacyBridge?.connector.accounts[0]
    : ''

  useEffect(() => {
    const adapterManager = getChainAdapterManager()
    const adapter = adapterManager.get(
      KnownChainIds.EthereumMainnet,
    ) as unknown as ethereum.ChainAdapter
    adapter.getGasFeeData().then(feeData => {
      setGasFeeData(feeData)
      const fastData = feeData[FeeDataKey.Fast]
      const fastAmount = fromBaseUnit(
        bnOrZero(fastData?.maxFeePerGas).times(txInputGas),
        18,
      ).toString()
      form.setValue('currentFeeAmount', fastAmount)
    })

    // for non mainnet chains we use the simple web3.getGasPrice()
    legacyWeb3?.web3?.eth?.getGasPrice().then((p: any) => setweb3GasFeeData(p))
  }, [form, legacyWeb3?.web3?.eth, txInputGas, walletConnect.legacyBridge?.connector.chainId])

  useEffect(() => {
    ;(async () => {
      if (legacyWeb3?.coinGeckoId)
        try {
          const { data } = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price?ids=${legacyWeb3?.coinGeckoId}&vs_currencies=usd`,
          )
          setPriceData(bnOrZero(data?.[legacyWeb3?.coinGeckoId]?.usd))
        } catch (e) {
          throw new Error('Failed to get price data')
        }
    })()
  }, [legacyWeb3])

  // determine which gas fees to use: user input > from the request > Fast
  const requestMaxPriorityFeePerGas = currentRequest?.params[0].maxPriorityFeePerGas
  const requestMaxFeePerGas = currentRequest?.params[0].maxFeePerGas

  const inputMaxPriorityFeePerGas = useWatch({
    control: form.control,
    name: 'maxPriorityFeePerGas',
  })

  const inputMaxFeePerGas = useWatch({
    control: form.control,
    name: 'maxFeePerGas',
  })

  const fastMaxPriorityFeePerGas = gasFeeData?.fast?.maxPriorityFeePerGas
  const fastMaxFeePerGas = gasFeeData?.fast?.maxFeePerGas

  const txMaxFeePerGas = Web3.utils.toHex(
    !!inputMaxFeePerGas
      ? inputMaxFeePerGas
      : !!requestMaxFeePerGas
      ? requestMaxFeePerGas
      : fastMaxFeePerGas,
  )

  const txMaxPriorityFeePerGas = Web3.utils.toHex(
    !!inputMaxPriorityFeePerGas
      ? inputMaxPriorityFeePerGas
      : !!requestMaxPriorityFeePerGas
      ? requestMaxPriorityFeePerGas
      : fastMaxPriorityFeePerGas,
  )

  // Recalculate estimated fee amount if txMaxFeePerGas changes
  useEffect(() => {
    const currentAmount = fromBaseUnit(bnOrZero(txMaxFeePerGas).times(txInputGas), 18)
    form.setValue('currentFeeAmount', currentAmount)
  }, [form, inputMaxFeePerGas, txInputGas, txMaxFeePerGas])

  // determine which nonce to use: user input > from the request > true nonce
  const requestNonce = currentRequest?.params[0].nonce
  const inputNonce = useWatch({ control: form.control, name: 'nonce' })
  const [trueNonce, setTrueNonce] = useState('0')
  useEffect(() => {
    ;(async () => {
      const count = await legacyWeb3?.web3.eth.getTransactionCount(address ?? '')
      !!count && setTrueNonce(`${count}`)
    })()
  }, [adapterManager, address, legacyWeb3?.web3.eth, walletState.wallet])
  const txInputNonce = Web3.utils.toHex(
    !!inputNonce ? inputNonce : !!requestNonce ? requestNonce : trueNonce,
  )

  useEffect(() => {
    ;(async () => {
      try {
        const estimate = await legacyWeb3?.web3.eth.estimateGas({
          from: walletConnect.legacyBridge?.connector.accounts[0],
          nonce: Number(txInputNonce),
          to: currentRequest.params[0].to,
          data: currentRequest.params[0].data,
        })
        setEstimatedGas(estimate?.toString() ?? '')
      } catch (e) {
        // 500k seems reasonable.
        // Maybe its better to gracefully fail here???
        setEstimatedGas('500000')
      }
    })()
  }, [
    txInputNonce,
    address,
    walletConnect.legacyBridge?.connector.accounts,
    currentRequest?.params,
    legacyWeb3?.web3.eth,
  ])

  if (!walletConnect.legacyBridge || !walletConnect.dapp) return null

  const txInput: TxData = {
    nonce: txInputNonce,
    gasLimit: txInputGas,
    data: currentRequest?.params[0].data,
    to: currentRequest?.params[0].to,
    value: currentRequest?.params[0].value,
    maxFeePerGas: txMaxFeePerGas,
    maxPriorityFeePerGas: txMaxPriorityFeePerGas,
  }

  // not mainnet and they havent entered custom gas fee data and no fee data from wc request.
  // default to the web3 gasPrice for the network
  if (
    walletConnect.legacyBridge?.connector.chainId !== 1 &&
    !inputMaxPriorityFeePerGas &&
    !requestMaxPriorityFeePerGas
  )
    txInput['gasPrice'] = Web3.utils.toHex(web3GasFeeData)

  if (!address) return <>No address</>

  return (
    <FormProvider {...form}>
      <VStack p={6} spacing={6} alignItems='stretch'>
        <Box>
          <Text
            fontWeight='medium'
            translation='plugins.walletConnectToDapps.modal.sendTransaction.sendingFrom'
            mb={4}
          />
          <AddressSummaryCard
            address={address ?? ''}
            name='My Wallet' // TODO: what string do we put here?
            icon={<KeepKeyIcon color='gray.500' w='full' h='full' />}
          />
        </Box>

        <Box>
          <Text
            fontWeight='medium'
            translation='plugins.walletConnectToDapps.modal.sendTransaction.interactingWith'
            mb={4}
          />
          <AddressSummaryCard
            address={currentRequest?.params[0].to}
            icon={
              <Image
                borderRadius='full'
                w='full'
                h='full'
                src='https://assets.coincap.io/assets/icons/256/eth.png'
              />
            }
          />
        </Box>

        <Box>
          <Text
            fontWeight='medium'
            translation='plugins.walletConnectToDapps.modal.sendTransaction.contractInteraction.title'
            mb={4}
          />
          <Tabs>
            <TabList>
              <Tab>
                <Text
                  fontWeight='medium'
                  translation='plugins.walletConnectToDapps.modal.sendTransaction.contractInteraction.insight'
                  mb={4}
                />
              </Tab>
              {/*<Tab>*/}
              {/*  <Text*/}
              {/*    fontWeight='medium'*/}
              {/*    translation='plugins.walletConnectToDapps.modal.sendTransaction.contractInteraction.simulation'*/}
              {/*    mb={4}*/}
              {/*  />*/}
              {/*</Tab>*/}
              <Tab>
                <Text
                  fontWeight='medium'
                  translation='plugins.walletConnectToDapps.modal.sendTransaction.contractInteraction.contract'
                  mb={4}
                />
              </Tab>
              <Tab>
                <Text
                  fontWeight='medium'
                  translation='plugins.walletConnectToDapps.modal.sendTransaction.contractInteraction.raw'
                  mb={4}
                />
              </Tab>
            </TabList>

            <TabPanels>
              <TabPanel>
                <Card bg={cardBg} borderRadius='md' px={4} py={2}>
                  <TransactionInsight request={currentRequest} />
                </Card>
              </TabPanel>
              {/*<TabPanel>*/}
              {/*  <Card bg={cardBg} borderRadius='md' px={4} py={2}>*/}
              {/*    <TransactionSimulation request={currentRequest} />*/}
              {/*  </Card>*/}
              {/*</TabPanel>*/}
              <TabPanel>
                <Card bg={cardBg} borderRadius='md' px={4} py={2}>
                  <ContractInteractionBreakdown request={currentRequest} />
                </Card>
              </TabPanel>
              <TabPanel>
                <Card bg={cardBg} borderRadius='md' px={4} py={2}>
                  <TransactionRaw request={currentRequest} />
                </Card>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Box>

        {shouldShowGas && (
          <ModalSection
            title={
              <HStack justify='space-between'>
                <Text translation='plugins.walletConnectToDapps.modal.sendTransaction.estGasCost' />
                {legacyWeb3?.symbol && (
                  <GasFeeEstimateLabel symbol={legacyWeb3?.symbol} fiatRate={priceData} />
                )}
              </HStack>
            }
            icon={<FaGasPump />}
            defaultOpen={false}
          >
            <Box pt={2}>
              <GasInput
                gasLimit={txInputGas}
                recommendedGasPriceData={{
                  maxPriorityFeePerGas: currentRequest?.params[0].maxPriorityFeePerGas,
                  maxFeePerGas: currentRequest?.params[0].maxFeePerGas,
                }}
              />
            </Box>
          </ModalSection>
        )}

        <ModalSection
          title={translate(
            'plugins.walletConnectToDapps.modal.sendTransaction.advancedParameters.title',
          )}
          icon={<FaWrench />}
          defaultOpen={false}
        >
          <TransactionAdvancedParameters />
        </ModalSection>

        <Text
          fontWeight='medium'
          color='gray.500'
          translation='plugins.walletConnectToDapps.modal.sendTransaction.description'
        />

        <VStack spacing={4}>
          <Button
            size='lg'
            width='full'
            colorScheme='blue'
            type='submit'
            isLoading={loading}
            onClick={() => onConfirm(txInput)}
          >
            {translate('plugins.walletConnectToDapps.modal.signMessage.confirm')}
          </Button>
          <Button size='lg' width='full' onClick={onReject}>
            {translate('plugins.walletConnectToDapps.modal.signMessage.reject')}
          </Button>
        </VStack>
      </VStack>
    </FormProvider>
  )
}
