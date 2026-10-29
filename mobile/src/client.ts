import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { createClient, type TokenPair } from './api'

const KEY = 'biletflow.checkin.tokens'
const defaultUrl = Platform.OS === 'android' ? 'http://10.0.2.2:8000/api/v1' : 'http://localhost:8000/api/v1'
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? defaultUrl
export const client = createClient(API_URL, {
  async get() {
    const value = await SecureStore.getItemAsync(KEY)
    if (!value) return null
    try { return JSON.parse(value) as TokenPair }
    catch { await SecureStore.deleteItemAsync(KEY); return null }
  },
  async set(value) {
    if (value) await SecureStore.setItemAsync(KEY, JSON.stringify(value))
    else await SecureStore.deleteItemAsync(KEY)
  },
})
