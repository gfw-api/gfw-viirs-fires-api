export default class ErrorSerializer {

    static serializeError(status: number, message: string): Record<string, any> {
        return { errors: [{ status, detail: message }] };
    }

}
