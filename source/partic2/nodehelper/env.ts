import { setupImpl as kvdbInit } from "./kvdb";
import { setupImpl as workerInit } from "./worker";
import {setup as jseioInit} from './jseio'

export function setupEnv(){
    kvdbInit()
    workerInit()
    jseioInit()
}