import { Alert, Box, Collapse, IconButton } from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';
import { DropzoneArea } from "mui-file-dropzone";
import { useCallback, useEffect, useState } from "react";


interface FileDropProps {
    text: string;
    errorMessage: string;
    fileLimit: number;
    onChange: (files: File[]) => void;
    onDropRejected?: () => void;
}


const FileDrop = (props: FileDropProps) => {

    const errorMessage = props.errorMessage;
    const [showError, setShowError] = useState(errorMessage !== '');

    useEffect( () => {
        if (props.errorMessage !== '') {
            setShowError(true);
        } else {
            setShowError(false);
        }
    },[props.errorMessage]);
    
    const onChange = useCallback((files: File[]) => {
        console.log('files[0].name', files[0]);
        props.onChange(files);
    },[props]);

    console.log('FileDrop Refreshing...', props);
    // console.log('showError', showError);
    // console.log('errorMessage', errorMessage);

    return (
        <>
            <Collapse in={showError}>
                <Alert severity="error" action={<IconButton size="small" onClick={() => { setShowError(false); }}><CloseIcon /></IconButton>}>{errorMessage}</Alert>
            </Collapse>
            <p>{props.text}</p>
            <Box component="section" minWidth={400} height={130}>
                {!showError && (
                    <DropzoneArea dropzoneClass="drop_zone" filesLimit={props.fileLimit} showPreviews={false} showPreviewsInDropzone={true} useChipsForPreview={true} 
                        showAlerts={false} dropzoneText={''} onDropRejected={props.onDropRejected} onChange={onChange} />
                    ) 
                }
            </Box>
        </>
    );
};

export default FileDrop;
