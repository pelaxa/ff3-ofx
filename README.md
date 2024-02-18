# Getting Started with FF3-OFX

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Development
In order to start the app in development mode, create a secrets.json file in the main folder (same level as setupProxy.js), and enter the following content:

```
{
    "proxyUrl": "https://<your FF3 FQDN>"
}
```
Since the above is using https, it is necessary to use the HTTPs startup script below.

Note: The secrets.json file is in .gitignore so it will not be checked into the repository.

## Available Scripts

In the project directory, you can run:

### `yarn install`

Installs the necessary node modules based on package.json.

### `yarn start` <== To start without HTTPS
### `HTTPS=true yarn start` <== to start with HTTPS

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser if not using HTTPS, otherwise go open [https://localhost:3000](https://localhost:3000).

The page will reload when you make changes.\
You may also see any lint errors in the console.

<!-- ### `yarn test` <== TODO

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information. -->


### `yarn compile`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `yarn dist`

Creates a new zip file with the artifacts in the `build` folder.\
It must be run after `yarn compile`.

Unpacking the zip file will create a ff3-ofx folder containing the application.

### `yarn package`

executes `yarn compile` and then `yarn dist`.

### `yarn eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

<!-- ## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration) -->

## Deployment

Once the application has been built, it produces a zip file that can be uploaded to your FireFlyIII (FF3) server.  This app currently only works if it is served from the same domain as your FF3 server, so the steps below help you get it installed in a subdirectory so that it can be easily accessed.

Note: These instructions are for a docker installation but should hopefully be clear enough for other installation types to figure out what is needed.

1. Edit your [docker-compose](https://raw.githubusercontent.com/firefly-iii/docker/main/docker-compose.yml) file.
2. Under the volumes section add the following entry, to map ff3-ofx folder to /ofx on your FF3 server.
   ```
    volumes:
      ...
      - ./ff3-ofx:/var/www/html/public/ofx
   ```
3. Unzip the build zip in the same folder as your docker-compose file.  This will produce the ff3-ofx folder and put all the build files under it.
4. Make sure file permissions are good.  `chmod 755` should be good enough to browse the folders and read the files.
5. Restart your FF3 server: `docker compose down; docker compose up -d`
6. Login to your FF3 application.
7. CLick on Options -> Profile -> OAuth.
8. Create a new Personal Access Token (PAT) and call it ff3-ofx.  Make sure to keep the token in a safe place in case you need it again later (and you will at some point).
9. Browse to the application: `https://<your FF3 domain>/ofx` and you should be prompted to input a token.  
10. (Optional) You can bookmark or add this URL to whatever dashboard you are using for future use.
11. Enter you PAT into the text box and hit the tab key.\
    Note: Right now the checkbox below the input field does not work but a future version will allow you not to store the token locally (i.e. you would have to enter the token each time you use the app if you do not save it).
12. You should be ready to drop an OFX file and get importing.



### `yarn build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
