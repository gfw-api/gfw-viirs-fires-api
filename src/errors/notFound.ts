class NotFound extends Error {

    constructor(message: string) {
        super(message);
        this.name = 'NotFound';
        this.message = message;
    }

}

export default NotFound;
